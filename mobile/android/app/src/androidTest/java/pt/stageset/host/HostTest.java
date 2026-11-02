package pt.stageset.host;
import android.app.Activity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class) public class HostTest {
    private <T> T find(View view,Class<T> kind){
        if(kind.isInstance(view))return kind.cast(view);
        if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++){T found=find(group.getChildAt(i),kind);if(found!=null)return found;}}
        return null;
    }
    private String js(WebView web,String script) throws Exception {
        AtomicReference<String> result=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->web.evaluateJavascript(script,value->{result.set(value);done.countDown();}));
        assertTrue("WebView callback timed out: "+script,done.await(30,TimeUnit.SECONDS));return result.get();
    }
    private void waitJS(WebView web,String script) throws Exception {for(int i=0;i<100;i++){if("true".equals(js(web,script)))return;Thread.sleep(150);}fail("Timeout: "+script);}
    @Test public void receivesLyricsAndReturnsHome() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            AtomicReference<WebView> receiver=new AtomicReference<>();
            scenario.onActivity(activity->{View root=activity.getWindow().getDecorView();find(root,EditText.class).setText("http://127.0.0.1:4186");find(root,Button.class).performClick();receiver.set(find(root,WebView.class));});
            WebView web=receiver.get();assertNotNull(web);
            waitJS(web,"!!document.getElementById('join')?.onsubmit");
            js(web,"document.getElementById('name').value='Android tablet test';document.getElementById('code').value='stageset-test';document.getElementById('join').requestSubmit()");
            waitJS(web,"document.querySelector('.current')?.textContent==='StageSet mobile test'");
            assertEquals("true",js(web,"typeof stageSetReceiver==='undefined'&&typeof require==='undefined'"));
            scenario.onActivity(activity->{activity.onBackPressed();assertNotNull(find(activity.getWindow().getDecorView(),EditText.class));});
        }
    }
    @Test public void validatesServerAddress() throws Exception {
        assertEquals("http://192.168.1.10:4180/host.html",MainActivity.receiverUri("http://192.168.1.10:4180/somewhere?code=x").toString());
        for(String value:new String[]{"file:///sdcard/private","javascript:alert(1)","https://name:secret@example.com"}){try{MainActivity.receiverUri(value);fail(value);}catch(Exception expected){}}
    }
}
