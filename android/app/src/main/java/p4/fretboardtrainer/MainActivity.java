package p4.fretboardtrainer;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Self-contained WebView shell around the bundled guitar trainer.
 *
 * The web app is served from a virtual https origin (appassets.androidplatform.net)
 * rather than file:// because its score, logs, and practice settings live in
 * document.cookie, which needs a real (secure) origin to work in WebView.
 * All responses come from assets/www — the app never touches the network
 * (it holds no INTERNET permission).
 */
public class MainActivity extends Activity {

    private static final String VIRTUAL_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + VIRTUAL_HOST + "/index.html";
    private static final String ASSET_ROOT = "www";

    /** Deep links: p4fretboard://lab?p=<payload> (payload = the #lab= share body). */
    private static final String LAB_SCHEME = "p4fretboard";
    /** Matches a Pages share URL or a raw p4fretboard link inside shared text. */
    private static final Pattern LAB_LINK = Pattern.compile("(?:#lab=|" + LAB_SCHEME + "://lab\\?p=)([^\\s&]+)");
    private static final int LAB_PAYLOAD_MAX = 8192;

    /** Overlays that open/close via the "hidden" CSS class (ES5 for old WebViews). */
    private static final String CLOSE_OVERLAY_JS =
            "(function(){var c=false;var ids=['settings-popup','instructions-tooltip',"
            + "'circle-of-fifths-tooltip','orientation-popup'];"
            + "for(var j=0;j<ids.length;j++){var e=document.getElementById(ids[j]);"
            + "if(e&&!e.classList.contains('hidden')){e.classList.add('hidden');c=true;}}"
            + "return c?'closed':'none';})()";

    private WebView webView;
    private boolean pageLoaded = false;
    private String pendingLabPayload = null;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        webView.setFitsSystemWindows(true); // inset padding under enforced edge-to-edge (API 35)
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true); // localStorage: theme, tuning, visited flag
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setSupportZoom(false);
        settings.setTextZoom(100); // pin layout against system font scaling

        CookieManager.getInstance().setAcceptCookie(true);

        // Native share sheet for the Progression Lab's 🔗 button (P4Native.share).
        webView.addJavascriptInterface(new ShareBridge(), "P4Native");

        // Without a WebChromeClient, alert() calls in the app are silently dropped.
        webView.setWebChromeClient(new WebChromeClient());

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (VIRTUAL_HOST.equals(url.getHost())) {
                    return false; // local content, served by shouldInterceptRequest
                }
                // Only the GitHub button (window.open with multi-window support
                // disabled navigates this WebView) and the upstream-repo link in
                // the help popup ever get here — hand them to the browser.
                openExternally(url);
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                // Runs on a background thread: touch only the AssetManager here.
                if ("GET".equals(request.getMethod())
                        && VIRTUAL_HOST.equals(request.getUrl().getHost())) {
                    return serveAsset(request.getUrl().getPath());
                }
                return null; // anything else fails offline — the intended failure mode
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageLoaded = true;
                if (pendingLabPayload != null) {
                    String payload = pendingLabPayload;
                    pendingLabPayload = null;
                    injectLabPayload(payload);
                }
            }
        });

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true); // chrome://inspect over adb
        }

        // A p4fretboard:// deep link or a shared #lab= URL may have launched us:
        // seed the first page load with it (the page applies the hash on arrival).
        String payload = extractLabPayload(getIntent());
        webView.loadUrl(START_URL + (payload != null ? "#lab=" + Uri.encode(payload) : ""));
    }

    /** JS bridge: the page calls P4Native.share(url, title) — the native way
     *  out of a WebView (the system sheet also offers copy-to-clipboard).
     *  Methods run on a binder thread, so hop to the UI thread. */
    private class ShareBridge {
        @JavascriptInterface
        public void share(final String text, final String title) {
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_TEXT, text != null ? text : "");
                if (title != null) send.putExtra(Intent.EXTRA_SUBJECT, title);
                try {
                    startActivity(Intent.createChooser(send, title != null ? title : "Share"));
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, R.string.no_share_target, Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    /** Pulls a Progression Lab share payload out of a VIEW (p4fretboard://lab?p=…)
     *  or SEND (text containing a #lab= URL) intent. Always returns the DECODED
     *  payload — re-encoding happens exactly once, at the JS boundary. */
    private String extractLabPayload(Intent intent) {
        if (intent == null) return null;
        Uri data = intent.getData();
        if (data != null && LAB_SCHEME.equals(data.getScheme())) {
            return sanitizeLabPayload(data.getQueryParameter("p"));
        }
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            CharSequence cs = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (cs == null) return null;
            Matcher m = LAB_LINK.matcher(cs.toString());
            while (m.find()) {
                String decoded;
                try {
                    decoded = URLDecoder.decode(m.group(1), "UTF-8");
                } catch (UnsupportedEncodingException e) {
                    return null; // UTF-8 is always supported; unreachable
                } catch (IllegalArgumentException e) {
                    continue; // stray '%' in unrelated text — try the next match
                }
                decoded = sanitizeLabPayload(decoded);
                if (decoded != null) return decoded;
            }
            Toast.makeText(this, R.string.no_lab_link, Toast.LENGTH_SHORT).show();
        }
        return null;
    }

    /** Cheap gate (shape validation is the page's job — its decode is
     *  junk-tolerant); the length cap keeps the JS injection small. */
    private static String sanitizeLabPayload(String payload) {
        if (payload == null || payload.isEmpty() || payload.length() > LAB_PAYLOAD_MAX) return null;
        return payload;
    }

    /** Feeds a decoded share payload to the page: location.hash assignment
     *  fires hashchange, the lab's listener applies it and opens the panel.
     *  encodeURIComponent runs inside the page so the payload is encoded
     *  exactly once. */
    private void injectLabPayload(String payload) {
        if (webView == null || payload == null) return;
        webView.evaluateJavascript(
                "location.hash = '#lab=' + encodeURIComponent(" + jsonQuote(payload) + ");", null);
    }

    /** A JSON string literal for evaluateJavascript (escapes quotes, backslashes,
     *  control characters, and anything non-ASCII as unicode escapes — old
     *  WebViews reject raw U+2028/U+2029 in string literals). */
    private static String jsonQuote(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 2);
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') sb.append('\\').append(c);
            else if (c < 0x20 || c > 0x7E) sb.append(String.format("\\u%04x", (int) c));
            else sb.append(c);
        }
        return sb.append('"').toString();
    }

    /** Deep links / shares arriving while the activity exists (launchMode
     *  singleTask): apply now if the page is up, else queue for onPageFinished. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String payload = extractLabPayload(intent);
        if (payload == null) return;
        if (pageLoaded) injectLabPayload(payload);
        else pendingLabPayload = payload;
    }

    /** Serves assets/www/<path> with the right MIME type; guards path traversal. */
    private WebResourceResponse serveAsset(String rawPath) {
        if (rawPath == null || rawPath.contains("..") || rawPath.contains("\\")) {
            return notFound();
        }
        String path = rawPath.startsWith("/") ? rawPath.substring(1) : rawPath;
        if (path.isEmpty()) {
            path = "index.html";
        }

        InputStream input;
        try {
            input = getAssets().open(ASSET_ROOT + "/" + path);
        } catch (IOException e) {
            return notFound();
        }

        int dot = path.lastIndexOf('.');
        String ext = dot >= 0 ? path.substring(dot + 1).toLowerCase() : "";
        String mime = mimeTypeFor(ext);
        boolean textual = isTextual(mime);
        return new WebResourceResponse(mime, textual ? "utf-8" : null, 200, "OK",
                Collections.<String, String>emptyMap(), input);
    }

    private static String mimeTypeFor(String ext) {
        switch (ext) {
            case "html": return "text/html";
            case "js":   return "application/javascript";
            case "css":  return "text/css";
            case "png":  return "image/png";
            case "svg":  return "image/svg+xml";
            case "json": return "application/json";
            case "ico":  return "image/x-icon";
            case "txt":  return "text/plain";
            case "woff2":return "font/woff2";
            default:     return "application/octet-stream";
        }
    }

    private static boolean isTextual(String mime) {
        return mime.startsWith("text/") || mime.equals("image/svg+xml") || mime.equals("application/javascript")
                || mime.equals("application/json");
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                Collections.<String, String>emptyMap(),
                new ByteArrayInputStream("Not found".getBytes(StandardCharsets.UTF_8)));
    }

    private void openExternally(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_SHORT).show();
        }
    }

    /** Back closes an open overlay (settings/instructions/circle of fifths) first;
     *  only exits when none is open. */
    @Override
    public void onBackPressed() {
        if (webView == null) {
            finish();
            return;
        }
        webView.evaluateJavascript(CLOSE_OVERLAY_JS, value -> {
            // Result arrives JSON-quoted: "\"closed\"" or "\"none\"" (null pre-load).
            if (!"\"closed\"".equals(value)) {
                finish();
            }
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
            CookieManager.getInstance().flush(); // persist score/settings cookies
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
