package org.interdependentway.a0;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(A0BridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
