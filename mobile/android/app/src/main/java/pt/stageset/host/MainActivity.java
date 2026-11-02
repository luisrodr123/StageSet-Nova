package pt.stageset.host;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.*;
import java.net.URI;
import java.io.OutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private FrameLayout root;
    private WebView web;
    private TextView status;
    private EditText address;
    private String origin;
    private byte[] pendingPdf;
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(16,20,27));
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        setContentView(root);
        if(BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);
        showHome();
    }
    private void showHome() {
        if(web!=null){web.destroy();web=null;}
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        root.removeAllViews();
        ScrollView scroll=new ScrollView(this);
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(dp(24),dp(30),dp(24),dp(24));
        TextView title=new TextView(this);title.setText("StageSet Host");title.setTextColor(Color.rgb(101,226,193));title.setTextSize(28);form.addView(title);
        TextView intro=new TextView(this);intro.setText("Recetor de letras · telemóvel e tablet\nEndereço apresentado no StageSet:");intro.setTextSize(16);form.addView(intro);
        address=new EditText(this);address.setSingleLine();address.setInputType(17);address.setHint("http://192.168.1.20:4180");address.setText(getPreferences(0).getString("address",""));address.setContentDescription("Endereço do StageSet");form.addView(address);
        Button connect=new Button(this);connect.setText("Ligar ao StageSet");connect.setOnClickListener(v->connect(address.getText().toString()));form.addView(connect);
        status=new TextView(this);status.setTextSize(16);form.addView(status);
        TextView help=new TextView(this);help.setText("Usa a mesma rede do computador principal. Depois de ligar, indica o nome deste dispositivo e o código da sessão. No StageSet, atribui a saída de letras. O botão Casa permite mudar de servidor.");form.addView(help);
        scroll.addView(form);root.addView(scroll,new FrameLayout.LayoutParams(-1,-1));
    }
    static URI receiverUri(String value) throws Exception {
        URI u=new URI(value.trim());
        if(!("http".equals(u.getScheme())||"https".equals(u.getScheme()))||u.getHost()==null||u.getRawUserInfo()!=null)throw new Exception("Indica um endereço HTTP ou HTTPS válido.");
        return new URI(u.getScheme(),null,u.getHost(),u.getPort(),"/host.html",null,null);
    }
    private boolean allowed(String value) { return value!=null&&(value.equals(origin)||value.startsWith(origin+"/")); }
    private void connect(String value) {
        try {
            URI url=receiverUri(value);origin=url.getScheme()+"://"+url.getRawAuthority();
            getPreferences(0).edit().putString("address",origin).apply();
            root.removeAllViews();web=new WebView(this);
            WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setUserAgentString(settings.getUserAgentString()+" StageSetHost/Android");
            web.setWebViewClient(new WebViewClient(){
                @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !allowed(request.getUrl().toString())&&!request.getUrl().toString().startsWith("blob:"+origin+"/");}
                @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())connectionError("Não foi possível ligar. Confirma o endereço, a rede e se os recetores estão ativos.");}
                @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error){handler.cancel();connectionError("Certificado HTTPS não confiado. Instala o certificado correto neste dispositivo ou usa HTTP na rede local.");}
            });
            web.setWebChromeClient(new WebChromeClient());
            web.setDownloadListener((downloadUrl,ua,disposition,mime,length)->{
                if(!downloadUrl.startsWith("blob:"+origin+"/")||!allowed(web.getUrl()))return;
                // No native JavaScript bridge is exposed to remote pages.
                web.evaluateJavascript("window.__hostPdf=null;fetch("+JSONObject.quote(downloadUrl)+").then(r=>r.blob()).then(b=>{if(b.size>30000000)throw Error('PDF demasiado grande');const f=new FileReader();f.onload=()=>window.__hostPdf=f.result;f.readAsDataURL(b)}).catch(()=>window.__hostPdf='error')",null);
                collectPdf(0);
            });
            root.addView(web,new FrameLayout.LayoutParams(-1,-1));
            Button home=new Button(this);home.setText("⌂");home.setContentDescription("Mudar de servidor");home.setAlpha(.65f);home.setOnClickListener(v->showHome());FrameLayout.LayoutParams button=new FrameLayout.LayoutParams(dp(52),dp(48),Gravity.BOTTOM|Gravity.RIGHT);button.setMargins(0,0,dp(6),dp(26));root.addView(home,button);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION);
            web.loadUrl(url.toString());
        }catch(Exception error){status.setText(error.getMessage());}
    }
    private void collectPdf(int attempt){
        if(web==null)return;
        web.evaluateJavascript("window.__hostPdf",value->{
            try{
                if(value==null||value.equals("null")){if(attempt<100)root.postDelayed(()->collectPdf(attempt+1),100);return;}
                String data=new JSONArray("["+value+"]").getString(0);
                if(!data.startsWith("data:application/pdf;base64,")||data.length()>41000000)throw new Exception("PDF indisponível ou demasiado grande.");
                byte[] bytes=Base64.decode(data.substring(data.indexOf(',')+1),Base64.DEFAULT);
                if(bytes.length<5||!new String(bytes,0,5,java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-"))throw new Exception("PDF inválido.");
                pendingPdf=bytes;web.evaluateJavascript("delete window.__hostPdf",null);
                Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/pdf").putExtra(Intent.EXTRA_TITLE,"StageSet-letras.pdf");startActivityForResult(save,1);
            }catch(Exception error){Toast.makeText(this,error.getMessage(),Toast.LENGTH_LONG).show();}
        });
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==1&&result==RESULT_OK&&data!=null&&pendingPdf!=null){try(OutputStream output=getContentResolver().openOutputStream(data.getData())){output.write(pendingPdf);}catch(Exception error){Toast.makeText(this,"Não foi possível guardar o PDF.",Toast.LENGTH_LONG).show();}}
        pendingPdf=null;
    }
    private void connectionError(String message){showHome();status.setText(message);}
    @Override public void onBackPressed(){if(web!=null)showHome();else super.onBackPressed();}
    @Override protected void onDestroy(){if(web!=null)web.destroy();super.onDestroy();}
}
