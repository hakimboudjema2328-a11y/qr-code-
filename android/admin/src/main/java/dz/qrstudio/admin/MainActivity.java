package dz.qrstudio.admin;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import java.io.OutputStream;

/** Page web administrateur emballée dans l'APK. Toutes les autres pages s'ouvrent hors de la WebView. */
public final class MainActivity extends Activity {
    private static final int CREATE_CSV = 102;
    private static final String HOME = "https://appassets.androidplatform.net/assets/www/index.html";
    private WebView webView;
    private byte[] pendingCsv;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(9, 10, 22));
        getWindow().setNavigationBarColor(Color.rgb(9, 10, 22));
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        if (android.os.Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);
        WebView.setWebContentsDebuggingEnabled(false);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return route(request.getUrl());
            }
            @Override @SuppressWarnings("deprecation") public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return route(Uri.parse(url));
            }
        });
        webView.addJavascriptInterface(new SaveInterface(), "AndroidSave");
        webView.addJavascriptInterface(new PrintInterface(), "AndroidPrint");
        webView.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(webView);
        webView.requestApplyInsets();
        if (savedInstanceState != null) webView.restoreState(savedInstanceState); else webView.loadUrl(HOME);
    }
    private boolean route(Uri uri) {
        if (uri == null) return true;
        String scheme = uri.getScheme(), host = uri.getHost();
        if ("https".equals(scheme) && "appassets.androidplatform.net".equals(host) && uri.getPath() != null && uri.getPath().startsWith("/assets/www/")) return false;
        if ("https".equals(scheme) || "mailto".equals(scheme) || "tel".equals(scheme)) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
            catch (Exception ignored) { Toast.makeText(this, "Impossible d’ouvrir ce lien", Toast.LENGTH_SHORT).show(); }
        }
        return true;
    }
    final class SaveInterface {
        @JavascriptInterface public void save(String name, String encoded) {
            if (name == null || !name.matches("[A-Za-z0-9_-]{1,80}\\.csv") || encoded == null || encoded.length() > 1_500_000) return;
            try {
                byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                if (bytes.length > 1_000_000) return;
                runOnUiThread(() -> {
                    if (pendingCsv != null) return;
                    pendingCsv = bytes;
                    try {
                        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                            .setType("text/csv").putExtra(Intent.EXTRA_TITLE, name);
                        startActivityForResult(intent, CREATE_CSV);
                    } catch (Exception ignored) { pendingCsv = null; Toast.makeText(MainActivity.this, "Enregistrement indisponible", Toast.LENGTH_SHORT).show(); }
                });
            } catch (IllegalArgumentException ignored) { }
        }
    }
    final class PrintInterface {
        @JavascriptInterface public void print() {
            runOnUiThread(() -> {
                PrintManager manager = (PrintManager) getSystemService(PRINT_SERVICE);
                if (manager != null) manager.print("QR Studio", webView.createPrintDocumentAdapter("QR Studio"), null);
            });
        }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == CREATE_CSV) {
            byte[] bytes = pendingCsv; pendingCsv = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                if (out == null) throw new java.io.IOException();
                out.write(bytes); Toast.makeText(this, "Fichier enregistré", Toast.LENGTH_SHORT).show();
            } catch (Exception ignored) { Toast.makeText(this, "Impossible d’enregistrer le fichier", Toast.LENGTH_SHORT).show(); }
        }
    }
    @Override public void onSaveInstanceState(Bundle state) { super.onSaveInstanceState(state); webView.saveState(state); }
    @Override public void onBackPressed() { if (webView.canGoBack()) webView.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { webView.removeJavascriptInterface("AndroidSave"); webView.removeJavascriptInterface("AndroidPrint"); webView.destroy(); super.onDestroy(); }
}
