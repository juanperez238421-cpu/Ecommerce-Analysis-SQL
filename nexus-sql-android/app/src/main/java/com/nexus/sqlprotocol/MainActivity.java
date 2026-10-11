package com.nexus.sqlprotocol;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.graphics.Color;
import android.content.Context;
import android.view.ViewGroup;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private WebView browser;
    private NativeEngine engine;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(8,13,22));
        getWindow().setNavigationBarColor(Color.rgb(8,13,22));
        engine = new NativeEngine(getApplicationContext());
        browser = new WebView(this);
        browser.setBackgroundColor(Color.rgb(8,13,22));
        browser.getSettings().setJavaScriptEnabled(true);
        browser.getSettings().setDomStorageEnabled(true);
        browser.getSettings().setAllowContentAccess(false);
        browser.getSettings().setAllowFileAccess(true);
        browser.getSettings().setAllowFileAccessFromFileURLs(false);
        browser.getSettings().setAllowUniversalAccessFromFileURLs(false);
        browser.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        browser.getSettings().setMediaPlaybackRequiresUserGesture(true);
        browser.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        browser.setWebChromeClient(new WebChromeClient());
        browser.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !"file".equals(request.getUrl().getScheme()) ||
                    !request.getUrl().toString().startsWith("file:///android_asset/");
            }
        });
        browser.addJavascriptInterface(new Api(), "NexusAndroid");
        setContentView(browser, new ViewGroup.LayoutParams(-1,-1));
        browser.loadUrl("file:///android_asset/index.html");
    }

    private final class Api {
        @JavascriptInterface public String request(String method, String path, String body){
            try {
                if (path == null || method == null) throw new IllegalArgumentException("Solicitud inválida");
                if ("GET".equals(method) && "/api/config".equals(path)) return NativeEngine.config().toString();
                if ("GET".equals(method) && "/api/state".equals(path)) return engine.snapshot().toString();
                if (!"POST".equals(method)) throw new IllegalArgumentException("Método no admitido");
                if (body == null || body.length()>10000) throw new IllegalArgumentException("Solicitud demasiado extensa");
                JSONObject request = new JSONObject(body);
                switch(path){
                    case "/api/query": return engine.query(request.optString("sql",""),30).toString();
                    case "/api/tick": return engine.step(request.optString("sql","")).toString();
                    case "/api/reset": engine.reset();return engine.snapshot().toString();
                    default: throw new IllegalArgumentException("Ruta desconocida");
                }
            }catch(Exception error){
                JSONObject response=new JSONObject();
                try {response.put("error",error.getMessage()!=null?error.getMessage():"Error SQLite");} catch(Exception ignored){}
                return response.toString();
            }
        }
    }

    @Override public void onBackPressed() {
        if(browser != null && browser.canGoBack()) browser.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if(browser != null){browser.removeJavascriptInterface("NexusAndroid"); browser.destroy(); browser=null;}
        if(engine!=null){engine.close();engine=null;}
        super.onDestroy();
    }
}
