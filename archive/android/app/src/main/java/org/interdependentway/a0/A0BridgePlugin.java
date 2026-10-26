package org.interdependentway.a0;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * a0 Android bridge — bounded, allowlisted phone capabilities behind the
 * existing React GUI. Every method returns a structured JSObject; schemas are
 * mirrored in android/a0-bridge.js. Termux commands are allowlisted templates
 * only: the model can never put raw text into bash.
 */
@CapacitorPlugin(
        name = "A0Bridge",
        permissions = {
                @Permission(alias = "camera", strings = {Manifest.permission.CAMERA}),
                @Permission(alias = "location", strings = {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}),
                @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
        }
)
public class A0BridgePlugin extends Plugin {

    private static final int REQ_CAMERA = 8001;
    private static final String PREFS = "a0bridge";
    private static final String TERMUX_PKG = "com.termux";
    private static final String TERMUX_RUN_COMMAND = "com.termux.RUN_COMMAND";

    private PluginCall pendingCameraCall;
    private Uri pendingCameraUri;
    private final Map<String, PluginCall> termuxPending = new ConcurrentHashMap<>();

    @Override
    public void load() {
        IntentFilter filter = new IntentFilter(TERMUX_RUN_COMMAND);
        if (Build.VERSION.SDK_INT >= 33) {
            getContext().registerReceiver(termuxReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(termuxReceiver, filter);
        }
    }

    private final BroadcastReceiver termuxReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!TERMUX_RUN_COMMAND.equals(intent.getAction())) return;
            String execId = intent.getStringExtra("com.termux.RUN_COMMAND_EXECUTION_ID");
            if (execId == null) return;
            PluginCall call = termuxPending.remove(execId);
            if (call == null) return;
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("execId", execId);
            out.put("exitCode", intent.getIntExtra("com.termux.RUN_COMMAND_EXIT_CODE", -1));
            out.put("stdout", intent.getStringExtra("com.termux.RUN_COMMAND_STDOUT"));
            out.put("stderr", intent.getStringExtra("com.termux.RUN_COMMAND_STDERR"));
            out.put("pending", false);
            call.resolve(out);
        }
    };

    // --- camera -------------------------------------------------------------

    @PluginMethod
    public void getPhoto(PluginCall call) {
        if (getPermissionState("camera") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermCallback");
            return;
        }
        launchCamera(call);
    }

    @PermissionCallback
    private void cameraPermCallback(PluginCall call) {
        if (getPermissionState("camera") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("camera permission denied");
            return;
        }
        launchCamera(call);
    }

    private void launchCamera(PluginCall call) {
        try {
            File dir = new File(getContext().getCacheDir(), "camera");
            if (!dir.exists()) dir.mkdirs();
            File photo = new File(dir, "a0-" + System.currentTimeMillis() + ".jpg");
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", photo);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, uri);
            pendingCameraCall = call;
            pendingCameraUri = uri;
            startActivityForResult(call, intent, REQ_CAMERA);
        } catch (Exception e) {
            call.reject("camera launch failed: " + e.getMessage());
        }
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_CAMERA || pendingCameraCall == null) return;
        PluginCall call = pendingCameraCall;
        pendingCameraCall = null;
        if (resultCode != Activity.RESULT_OK) {
            call.reject("camera cancelled");
            return;
        }
        File photo = new File(pendingCameraUri.getPath());
        JSObject out = new JSObject();
        out.put("ok", photo.exists());
        out.put("name", photo.getName());
        out.put("uri", pendingCameraUri.toString());
        out.put("size", photo.exists() ? photo.length() : 0);
        out.put("mime", "image/jpeg");
        call.resolve(out);
    }

    // --- location -----------------------------------------------------------

    @PluginMethod
    public void getLocation(PluginCall call) {
        if (getPermissionState("location") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationPermCallback");
            return;
        }
        readLocation(call);
    }

    @PermissionCallback
    private void locationPermCallback(PluginCall call) {
        if (getPermissionState("location") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("location permission denied");
            return;
        }
        readLocation(call);
    }

    private void readLocation(PluginCall call) {
        try {
            LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
            Location loc = null;
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                loc = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            }
            if (loc == null && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                loc = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            }
            if (loc == null) {
                call.reject("no last-known location available yet");
                return;
            }
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("lat", loc.getLatitude());
            out.put("lng", loc.getLongitude());
            out.put("provider", loc.getProvider());
            out.put("accuracy", loc.getAccuracy());
            out.put("ts", loc.getTime());
            call.resolve(out);
        } catch (Exception e) {
            call.reject("location error: " + e.getMessage());
        }
    }

    // --- files (sandbox-scoped) --------------------------------------------

    private File resolveRoot(String root) throws Exception {
        if ("app".equals(root)) return getContext().getFilesDir();
        if ("documents".equals(root)) {
            File ext = getContext().getExternalFilesDir(null);
            if (ext == null) throw new Exception("external files not available");
            return ext;
        }
        throw new Exception("unknown root: " + root);
    }

    private File resolvePath(String root, String path) throws Exception {
        if (path == null) path = "";
        if (path.contains("..")) throw new Exception("path traversal is not allowed");
        File base = resolveRoot(root);
        File target = new File(base, path);
        String basePath = base.getCanonicalPath();
        String targetPath = target.getCanonicalPath();
        if (!targetPath.startsWith(basePath)) throw new Exception("path escapes the allowlisted root");
        return target;
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        try {
            String root = call.getString("root", "app");
            String path = call.getString("path", "");
            File dir = resolvePath(root, path);
            JSONArray entries = new JSONArray();
            File[] children = dir.listFiles();
            if (children != null) {
                Arrays.sort(children, (a, b) -> a.getName().compareToIgnoreCase(b.getName()));
                for (File f : children) {
                    JSONObject entry = new JSONObject();
                    entry.put("name", f.getName());
                    entry.put("path", path + "/" + f.getName());
                    entry.put("dir", f.isDirectory());
                    entry.put("size", f.isFile() ? f.length() : 0);
                    entries.put(entry);
                }
            }
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("entries", entries);
            call.resolve(out);
        } catch (Exception e) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("error", e.getMessage());
            call.resolve(out);
        }
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        try {
            String root = call.getString("root", "app");
            String path = call.getString("path", "");
            int maxBytes = call.getInt("maxBytes", 1_048_576);
            File f = resolvePath(root, path);
            if (!f.isFile()) throw new Exception("not a file");
            if (f.length() > maxBytes) throw new Exception("file exceeds maxBytes");
            byte[] bytes = new byte[(int) f.length()];
            try (FileInputStream in = new FileInputStream(f)) {
                int read = in.read(bytes);
                if (read != bytes.length) throw new Exception("short read");
            }
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("size", bytes.length);
            out.put("content", Base64.getEncoder().encodeToString(bytes));
            out.put("mime", guessMime(f.getName()));
            call.resolve(out);
        } catch (Exception e) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("error", e.getMessage());
            call.resolve(out);
        }
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        try {
            String root = call.getString("root", "app");
            String path = call.getString("path", "");
            String content = call.getString("content", "");
            boolean append = call.getBoolean("append", false);
            File f = resolvePath(root, path);
            File parent = f.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();
            byte[] bytes = Base64.getDecoder().decode(content);
            try (FileOutputStream out = new FileOutputStream(f, append)) {
                out.write(bytes);
            }
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("path", path);
            out.put("size", f.length());
            call.resolve(out);
        } catch (Exception e) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("error", e.getMessage());
            call.resolve(out);
        }
    }

    private String guessMime(String name) {
        if (name.endsWith(".txt")) return "text/plain";
        if (name.endsWith(".json")) return "application/json";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }

    // --- notifications ------------------------------------------------------

    @PluginMethod
    public void notify(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
                && getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notifyPermCallback");
            return;
        }
        sendNotification(call);
    }

    @PermissionCallback
    private void notifyPermCallback(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
                && getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("notification permission denied");
            return;
        }
        sendNotification(call);
    }

    private void sendNotification(PluginCall call) {
        try {
            String title = call.getString("title", "a0");
            String text = call.getString("text", "");
            int id = call.getInt("id", (int) System.currentTimeMillis() % Integer.MAX_VALUE);
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            String channelId = "a0-bridge";
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel ch = new NotificationChannel(channelId, "a0 bridge", NotificationManager.IMPORTANCE_DEFAULT);
                nm.createNotificationChannel(ch);
            }
            NotificationCompat.Builder b = new NotificationCompat.Builder(getContext(), channelId)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setAutoCancel(true);
            nm.notify(id, b.build());
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("id", id);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("notification failed: " + e.getMessage());
        }
    }

    // --- sensors ------------------------------------------------------------

    @PluginMethod
    public void readSensor(PluginCall call) {
        try {
            SensorManager sm = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
            String wanted = call.getString("sensor", "accelerometer");
            int type = "light".equals(wanted) ? Sensor.TYPE_LIGHT : Sensor.TYPE_ACCELEROMETER;
            Sensor sensor = sm.getDefaultSensor(type);
            if (sensor == null) {
                call.reject("sensor not available: " + wanted);
                return;
            }
            final CountDownLatch latch = new CountDownLatch(1);
            final float[][] holder = new float[1][];
            SensorEventListener listener = new SensorEventListener() {
                @Override
                public void onSensorChanged(SensorEvent event) {
                    holder[0] = event.values.clone();
                    latch.countDown();
                }

                @Override
                public void onAccuracyChanged(Sensor sensor, int accuracy) {
                }
            };
            sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_UI);
            boolean got = latch.await(2, TimeUnit.SECONDS);
            sm.unregisterListener(listener);
            JSObject out = new JSObject();
            if (!got || holder[0] == null) {
                out.put("ok", false);
                out.put("sensor", wanted);
                out.put("error", "sensor read timed out");
                call.resolve(out);
                return;
            }
            JSObject values = new JSObject();
            float[] v = holder[0];
            for (int i = 0; i < v.length; i++) {
                values.put("v" + i, v[i]);
            }
            out.put("ok", true);
            out.put("sensor", wanted);
            out.put("values", values);
            out.put("ts", System.currentTimeMillis());
            call.resolve(out);
        } catch (Exception e) {
            call.reject("sensor error: " + e.getMessage());
        }
    }

    // --- Termux RUN_COMMAND bridge ------------------------------------------

    // Allowlisted templates. The model may select one of these ids and fill
    // typed args only. A raw command string never crosses this boundary.
    private static final Map<String, String[]> TERMUX_TEMPLATES = new HashMap<>();

    static {
        TERMUX_TEMPLATES.put("sys.pwd", new String[]{"pwd"});
        TERMUX_TEMPLATES.put("sys.whoami", new String[]{"whoami"});
        TERMUX_TEMPLATES.put("sys.df", new String[]{"df", "-h"});
        TERMUX_TEMPLATES.put("sys.uname", new String[]{"uname", "-a"});
        TERMUX_TEMPLATES.put("git.status", new String[]{"git", "status", "--short"});
        TERMUX_TEMPLATES.put("git.log", new String[]{"git", "log", "--oneline", "-n"});
        TERMUX_TEMPLATES.put("py.version", new String[]{"python3", "--version"});
        TERMUX_TEMPLATES.put("ssh.status", new String[]{"ssh", "-T", "git@github.com"});
    }

    @PluginMethod
    public void termuxRun(PluginCall call) {
        try {
            String templateId = call.getString("templateId", "");
            JSObject args = call.getObject("args", new JSObject());
            String[] template = TERMUX_TEMPLATES.get(templateId);
            if (template == null) {
                call.reject("termux command template is not allowlisted: " + templateId);
                return;
            }
            String cwd = "/data/data/com.termux/files/home";
            List<String> argv = new ArrayList<>();
            for (String part : template) {
                if ("-n".equals(part) && "git.log".equals(templateId)) {
                    Integer n = args.getInteger("n");
                    argv.add(String.valueOf(n == null ? 10 : Math.max(1, Math.min(20, n))));
                } else if ("git".equals(part) && templateId.startsWith("git.")) {
                    argv.add(part);
                    String path = args.getString("path");
                    if (path != null && !path.isEmpty()) {
                        cwd = path.startsWith("/") ? path : "/data/data/com.termux/files/home/" + path;
                    }
                } else {
                    argv.add(part);
                }
            }

            String execId = UUID.randomUUID().toString();
            Intent intent = new Intent(TERMUX_RUN_COMMAND);
            intent.setClassName(TERMUX_PKG, "com.termux.app.RunCommandService");
            intent.putExtra("com.termux.RUN_COMMAND_PATH", cwd);
            intent.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", argv.toArray(new String[0]));
            intent.putExtra("com.termux.RUN_COMMAND_BACKGROUND", false);
            intent.putExtra("com.termux.RUN_COMMAND_SESSION_ACTION", "0");
            intent.putExtra("com.termux.RUN_COMMAND_EXECUTION_ID", execId);

            try {
                getContext().startService(intent);
                termuxPending.put(execId, call);
                // Resolve as pending if Termux does not answer; the receiver
                // above resolves the real result when the broadcast arrives.
                new java.util.Timer().schedule(new java.util.TimerTask() {
                    @Override
                    public void run() {
                        PluginCall waiting = termuxPending.remove(execId);
                        if (waiting != null) {
                            JSObject out = new JSObject();
                            out.put("ok", false);
                            out.put("execId", execId);
                            out.put("pending", false);
                            out.put("error", "termux result timeout (is Termux installed and RUN_COMMAND enabled?)");
                            waiting.resolve(out);
                        }
                    }
                }, 15000);
            } catch (Exception e) {
                call.reject("termux not available: " + e.getMessage());
            }
        } catch (Exception e) {
            call.reject("termux bridge error: " + e.getMessage());
        }
    }

    // --- a0 endpoint config -------------------------------------------------

    @PluginMethod
    public void getConfig(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject out = new JSObject();
        out.put("endpoint", prefs.getString("endpoint", ""));
        out.put("token", prefs.getString("token", ""));
        call.resolve(out);
    }

    @PluginMethod
    public void setConfig(PluginCall call) {
        String endpoint = call.getString("endpoint", "");
        String token = call.getString("token", "");
        if (!endpoint.startsWith("https://")) {
            call.reject("endpoint must be https://");
            return;
        }
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString("endpoint", endpoint).putString("token", token).apply();
        JSObject out = new JSObject();
        out.put("ok", true);
        out.put("endpoint", endpoint);
        call.resolve(out);
    }
}
