package com.qrstudio.admin;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private WebView webView;
    private LinearLayout offline;
    private ProgressBar progress;
    private final Uri allowed = Uri.parse(BuildConfig.ADMIN_URL);

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(248, 248, 251));
        getWindow().setNavigationBarColor(Color.rgb(248, 248, 251));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(248, 248, 251));
        root.setFitsSystemWindows(true);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(248, 248, 251));
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); // Required by the React admin application.
        settings.setDomStorageEnabled(true); // Supabase persists the session in this WebView.
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setWebViewClient(new SafeClient());
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setIndeterminate(true);
        FrameLayout.LayoutParams bar = new FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP);
        root.addView(progress, bar);
        offline = makeOfflineView();
        root.addView(offline, new FrameLayout.LayoutParams(-1, -1));
        offline.setVisibility(View.GONE);
        setContentView(root);
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) webView.loadUrl(BuildConfig.ADMIN_URL);
    }
    private LinearLayout makeOfflineView() {
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setGravity(Gravity.CENTER); box.setPadding(dp(30), dp(24), dp(30), dp(24)); box.setBackgroundColor(Color.rgb(248,248,251));
        TextView title = new TextView(this); title.setText("Connexion indisponible"); title.setTextSize(21); title.setTextColor(Color.rgb(40,38,60)); title.setGravity(Gravity.CENTER); box.addView(title);
        TextView text = new TextView(this); text.setText("Vérifiez votre connexion, puis réessayez pour accéder à l’administration."); text.setTextSize(14); text.setTextColor(Color.rgb(120,118,140)); text.setGravity(Gravity.CENTER); text.setPadding(0,dp(12),0,dp(20)); box.addView(text);
        Button retry = new Button(this); retry.setText("Réessayer"); retry.setOnClickListener(v -> { offline.setVisibility(View.GONE); webView.loadUrl(BuildConfig.ADMIN_URL); }); box.addView(retry);
        return box;
    }
    private int dp(int value) { return (int) (getResources().getDisplayMetrics().density * value + .5f); }
    private boolean isAllowed(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme()) && allowed.getHost() != null && allowed.getHost().equalsIgnoreCase(uri.getHost()) && allowed.getPort() == uri.getPort();
    }
    private final class SafeClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isAllowed(uri)) return false;
            if (uri != null && "https".equalsIgnoreCase(uri.getScheme())) {
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (ActivityNotFoundException ignored) { }
            }
            return true;
        }
        @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) { progress.setVisibility(View.VISIBLE); offline.setVisibility(View.GONE); }
        @Override public void onPageFinished(WebView view, String url) { progress.setVisibility(View.GONE); }
        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) { if (request.isForMainFrame()) { progress.setVisibility(View.GONE); offline.setVisibility(View.VISIBLE); } }
        @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); progress.setVisibility(View.GONE); offline.setVisibility(View.VISIBLE); }
    }
    @Override protected void onSaveInstanceState(Bundle outState) { super.onSaveInstanceState(outState); webView.saveState(outState); }
    @Override public void onBackPressed() { if (webView.canGoBack()) webView.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { if (webView != null) { webView.destroy(); webView = null; } super.onDestroy(); }
}
