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
import java.nio.charset.StandardCharsets;
import java.util.Collections;

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

    /** Overlays that open/close via the "hidden" CSS class (ES5 for old WebViews). */
    private static final String CLOSE_OVERLAY_JS =
            "(function(){var c=false;var ids=['settings-popup','instructions-tooltip',"
            + "'circle-of-fifths-tooltip','orientation-popup'];"
            + "for(var j=0;j<ids.length;j++){var e=document.getElementById(ids[j]);"
            + "if(e&&!e.classList.contains('hidden')){e.classList.add('hidden');c=true;}}"
            + "return c?'closed':'none';})()";

    private WebView webView;

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
        });

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true); // chrome://inspect over adb
        }

        webView.loadUrl(START_URL);
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
