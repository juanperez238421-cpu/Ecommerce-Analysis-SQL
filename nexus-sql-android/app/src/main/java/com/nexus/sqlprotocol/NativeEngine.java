package com.nexus.sqlprotocol;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteException;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Offline, authoritative SQLite simulation engine. SQL decisions never write game data. */
public final class NativeEngine {
    private static final int WIDTH=28, HEIGHT=18;
    private static final Pattern READ_QUERY=Pattern.compile("^(SELECT|WITH)\\b",Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final int[][] NODES = {
        {1,8,4,0,5,2},{2,12,3,0,4,3},{3,16,5,1,4,2},{4,21,4,0,5,3},
        {5,24,8,1,6,2},{6,23,13,0,5,2},{7,18,15,1,4,3},{8,13,14,0,4,2},
        {9,9,14,1,3,1},{10,15,10,0,5,2},{11,20,10,1,4,2}
    };
    private static final int[][] BLOCKS={{1,2},{1,3},{2,2},{2,3},{25,2},{26,2},{25,3},{26,3},
        {2,14},{2,15},{3,15},{25,14},{26,14},{25,15},{22,2}};
    private static final String[][] FACILITIES={
        {"1","NEXUS-HQ","HQ","4","8"},{"2","DROP-01","DEPOT","9","8"},
        {"3","ION-01","CHARGER","5","12"},{"4","FORGE-3","REFINERY","17","8"},
        {"5","HELIX-9","REACTOR","23","8"}
    };
    public static final String DEFAULT_SQL="-- PROTOCOL 01 · AUTOMATIZACIÓN\n-- Una fila = una orden para un robot.\nSELECT robot_id, action, x, y\nFROM jobs\nORDER BY priority DESC, robot_id\nLIMIT 2;";
    public static final String MINE_SQL="-- Busca cristales disponibles para ADA-01.\nSELECT 1 AS robot_id, 'MINE' AS action, x, y\nFROM resource_nodes\nWHERE stock > 0 AND resource = 'CRYSTAL'\nORDER BY ABS(x-4) + ABS(y-8)\nLIMIT 1;";
    public static final String ANALYSIS_SQL="-- Explora las reservas de la colonia.\nSELECT resource, SUM(stock) AS units, COUNT(*) AS deposits\nFROM resource_nodes GROUP BY resource ORDER BY units DESC;";
    private final Context context;
    private SQLiteDatabase db;
    private final Set<Integer> blocked = new HashSet<>();
    private static final String[] SNAPSHOT_TABLES={"robots","resource_nodes","facilities","events"};

    public NativeEngine(Context context) {
        this.context=context;
        for(int[] point:BLOCKS)blocked.add(pos(point[0],point[1]));
        open();
    }
    private static int pos(int x,int y){return y*WIDTH+x;}
    private void open(){
        db=context.openOrCreateDatabase("nexus.db",Context.MODE_PRIVATE,null);
        Cursor c=db.rawQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'",null);
        boolean exists;try {exists=c.moveToFirst();} finally {c.close();}
        if(!exists)seed();
    }
    private void exec(String sql,Object...args){db.execSQL(sql,args);}
    private void seed(){
        db.beginTransaction();
        try{
            StringBuilder sb=new StringBuilder();
            try(BufferedReader reader=new BufferedReader(new InputStreamReader(context.getAssets().open("schema.sql")))){
                for(String line;(line=reader.readLine())!=null;){
                    if(!line.trim().startsWith("--")) sb.append(line).append('\n');
                }
            }catch(Exception e){throw new IllegalStateException("No fue posible leer el esquema SQLite",e);}
            for(String command:sb.toString().split(";")){
                String statement=command.trim();if(!statement.isEmpty())db.execSQL(statement);
            }
            for(String[] kv:new String[][]{{"tick","0"},{"credits","240"},{"xp","0"},{"delivered","0"},{"level","1"}}){
                exec("INSERT INTO meta(key,value) VALUES(?,?)",kv[0],Integer.parseInt(kv[1]));
            }
            exec("INSERT INTO robots(id,name,x,y,energy,cargo,capacity) VALUES(?,?,?,?,?,?,?)",1,"ADA-01",4,9,100,0,3);
            exec("INSERT INTO robots(id,name,x,y,energy,cargo,capacity) VALUES(?,?,?,?,?,?,?)",2,"ECHO-02",5,9,100,0,3);
            for(int[] n:NODES)exec("INSERT INTO resource_nodes(id,x,y,resource,stock,max_stock,richness) VALUES(?,?,?,?,?,?,?)",
                n[0],n[1],n[2],n[3]==0?"CRYSTAL":"ALLOY",n[4],n[4],n[5]);
            for(String[] f:FACILITIES)exec("INSERT INTO facilities(id,code,type,x,y) VALUES(?,?,?,?,?)",
                Integer.parseInt(f[0]),f[1],f[2],Integer.parseInt(f[3]),Integer.parseInt(f[4]));
            exec("INSERT INTO inventory(item,quantity) VALUES(?,?)","CRYSTAL",0);
            exec("INSERT INTO inventory(item,quantity) VALUES(?,?)","ALLOY",0);
            event(0,"SYSTEM","NEXUS online · protocolos sincronizados",4,8);
            db.setTransactionSuccessful();
        }finally {db.endTransaction();}
    }
    public static JSONObject config() throws Exception {
        JSONObject o=new JSONObject();o.put("default_sql",DEFAULT_SQL);o.put("mine_sql",MINE_SQL);
        o.put("analysis_sql",ANALYSIS_SQL);return o;
    }
    private static Object cursorField(Cursor c,int i){
        switch(c.getType(i)){
            case Cursor.FIELD_TYPE_NULL:return JSONObject.NULL;
            case Cursor.FIELD_TYPE_INTEGER:return c.getLong(i);
            case Cursor.FIELD_TYPE_FLOAT:return c.getDouble(i);
            case Cursor.FIELD_TYPE_STRING:return c.getString(i);
            default:return "[binary]";
        }
    }
    private JSONArray table(String sql) throws Exception {
        JSONArray array=new JSONArray();
        try(Cursor c=db.rawQuery(sql,null)){
            String[] columns=c.getColumnNames();
            while(c.moveToNext()){
                JSONObject row=new JSONObject();
                for(int i=0;i<columns.length;i++)row.put(columns[i],cursorField(c,i));
                array.put(row);
            }
        }
        return array;
    }
    private int scalar(String sql){try(Cursor c=db.rawQuery(sql,null)){return c.moveToFirst()?c.getInt(0):0;}}
    private int meta(String key){
        try(Cursor c=db.rawQuery("SELECT value FROM meta WHERE key=?",new String[]{key})){
            return c.moveToFirst()?c.getInt(0):0;
        }
    }
    private void putMeta(String key,int value){exec("UPDATE meta SET value=? WHERE key=?",value,key);}
    private void event(int tick,String kind,String message,Integer x,Integer y){
        exec("INSERT INTO events(tick,kind,message,x,y) VALUES(?,?,?,?,?)",tick,kind,message,x,y);
        exec("DELETE FROM events WHERE id NOT IN(SELECT id FROM events ORDER BY id DESC LIMIT 100)");
    }
    public synchronized JSONObject snapshot() throws Exception {
        JSONObject out=new JSONObject();
        for(String name:SNAPSHOT_TABLES) {
            String order=name.equals("events")?" ORDER BY id DESC LIMIT 9":" ORDER BY id ASC";
            JSONArray rows=table("SELECT * FROM "+name+order);
            if(name.equals("events")){
                // Newest event first matches the browser experience.
            }
            out.put(name,rows);
        }
        JSONObject inventory=new JSONObject();
        try(Cursor c=db.rawQuery("SELECT item,quantity FROM inventory",null)){
            while(c.moveToNext())inventory.put(c.getString(0),c.getInt(1));
        }
        out.put("inventory",inventory);
        JSONObject meta=new JSONObject();
        try(Cursor c=db.rawQuery("SELECT key,value FROM meta",null)){
            while(c.moveToNext())meta.put(c.getString(0),c.getInt(1));
        }
        out.put("meta",meta);
        JSONArray b=new JSONArray();for(int[] p:BLOCKS){JSONArray point=new JSONArray();point.put(p[0]);point.put(p[1]);b.put(point);}
        out.put("blocked",b);out.put("width",WIDTH);out.put("height",HEIGHT);out.put("version","0.4.0-android");
        return out;
    }
    private static String withoutLeadingComments(String input) {
        String t=input.trim();
        while(true){
            if(t.startsWith("--")){
                int nl=t.indexOf('\n'); if(nl<0)return "";t=t.substring(nl+1).trim();
            }else if(t.startsWith("/*")){
                int end=t.indexOf("*/"); if(end<0)return "";t=t.substring(end+2).trim();
            }else return t;
        }
    }
    public synchronized JSONObject query(String sql,int limit) throws Exception {
        if(sql==null || sql.trim().isEmpty() || sql.length()>6500)
            throw new IllegalArgumentException("La consulta debe tener entre 1 y 6500 caracteres.");
        if(!READ_QUERY.matcher(withoutLeadingComments(sql)).find())
            throw new IllegalArgumentException("Solo SELECT o WITH están permitidos.");
        // A separate read-only connection prevents player SQL from modifying the game database.
        SQLiteDatabase reader=SQLiteDatabase.openDatabase(context.getDatabasePath("nexus.db").getPath(),null,
            SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS);
        try {
            try(Cursor c=reader.rawQuery(sql,null)){
                String[] columns=c.getColumnNames();JSONArray names=new JSONArray();
                for(String column:columns)names.put(column);
                JSONArray rows=new JSONArray();int count=0;
                while(count<=limit && c.moveToNext()){
                    if(count==limit)break;
                    JSONObject row=new JSONObject();
                    for(int i=0;i<columns.length;i++)row.put(columns[i],cursorField(c,i));
                    rows.put(row);count++;
                }
                boolean truncated=c.getPosition()>=limit && !c.isAfterLast();
                // Cursor position logic: a single extra row is read only to determine truncation.
                JSONObject out=new JSONObject();out.put("columns",names);out.put("rows",rows);
                out.put("truncated",truncated);return out;
            }
        } catch(SQLiteException error){throw new IllegalArgumentException("SQLite: "+error.getMessage());}
        finally {reader.close();}
    }
    private JSONObject robot(int id) throws Exception {
        try(Cursor c=db.rawQuery("SELECT * FROM robots WHERE id=?",new String[]{String.valueOf(id)})){
            if(!c.moveToFirst())return null;
            JSONObject result=new JSONObject();for(int i=0;i<c.getColumnCount();i++)result.put(c.getColumnName(i),cursorField(c,i));
            return result;
        }
    }
    private JSONObject resource(int x,int y) throws Exception {
        try(Cursor c=db.rawQuery("SELECT * FROM resource_nodes WHERE x=? AND y=?",new String[]{""+x,""+y})){
            if(!c.moveToFirst())return null;
            JSONObject result=new JSONObject();for(int i=0;i<c.getColumnCount();i++)result.put(c.getColumnName(i),cursorField(c,i));
            return result;
        }
    }
    private boolean facility(String kind,int x,int y){
        try(Cursor c=db.rawQuery("SELECT 1 FROM facilities WHERE type=? AND x=? AND y=?",
            new String[]{kind,""+x,""+y})) {return c.moveToFirst();}
    }
    private List<Integer> path(int sx,int sy,int ex,int ey){
        int start=pos(sx,sy),end=pos(ex,ey);
        if(start==end)return Arrays.asList(start);
        int[] parents=new int[WIDTH*HEIGHT];Arrays.fill(parents,-2);parents[start]=-1;
        ArrayDeque<Integer> q=new ArrayDeque<>();q.add(start);
        int[][] offsets={{1,0},{0,-1},{-1,0},{0,1}};
        while(!q.isEmpty()){
            int p=q.removeFirst(),x=p%WIDTH,y=p/WIDTH;
            for(int[] d:offsets){int nx=x+d[0],ny=y+d[1];
                if(nx<0 || ny<0 || nx>=WIDTH || ny>=HEIGHT)continue;
                int v=pos(nx,ny);if(parents[v]!=-2||blocked.contains(v))continue;
                parents[v]=p;
                if(v==end){ArrayList<Integer> route=new ArrayList<>();
                    for(int z=end;z!=-1;z=parents[z])route.add(0,z);
                    return route;
                }
                q.add(v);
            }
        }
        return new ArrayList<>();
    }
    private String act(int tick,JSONObject robot,String action,int x,int y) throws Exception {
        int id=robot.getInt("id"),energy=robot.getInt("energy"),cargo=robot.getInt("cargo");
        String name=robot.getString("name"),msg;
        switch(action){
            case "MINE":{
                JSONObject node=resource(x,y);
                if(node==null || node.getInt("stock")<1 || cargo>=robot.getInt("capacity") ||
                    (cargo>0&&!node.getString("resource").equals(robot.optString("cargo_resource"))))
                    return "Depósito agotado, carga completa o recurso incorrecto";
                exec("UPDATE resource_nodes SET stock=stock-1 WHERE id=?",node.getInt("id"));
                exec("UPDATE robots SET cargo=cargo+1,cargo_resource=?,energy=MAX(0,energy-3),jobs_completed=jobs_completed+1 WHERE id=?",
                    node.getString("resource"),id);
                putMeta("xp",meta("xp")+8);
                msg=name+" · extracción "+node.getString("resource")+" +1";break;
            }
            case "DELIVER":{
                if(!facility("DEPOT",x,y) || cargo<1)return "Entrega sin carga o fuera del depósito";
                exec("UPDATE inventory SET quantity=quantity+? WHERE item=?",cargo,robot.getString("cargo_resource"));
                exec("UPDATE robots SET cargo=0,cargo_resource=NULL,energy=MAX(0,energy-2),jobs_completed=jobs_completed+1 WHERE id=?",id);
                putMeta("credits",meta("credits")+cargo*18);
                putMeta("delivered",meta("delivered")+cargo);
                putMeta("xp",meta("xp")+cargo*12);
                msg=name+" · entrega "+cargo+" unidades · +"+(cargo*18)+" CR";break;
            }
            case "CHARGE":{
                if(!facility("CHARGER",x,y))return "Destino sin cargador";
                exec("UPDATE robots SET energy=MIN(100,energy+42),jobs_completed=jobs_completed+1 WHERE id=?",id);
                msg=name+" · batería +42%";break;
            }
            default:return "Acción desconocida";
        }
        event(tick,action,msg,x,y);return msg;
    }
    public synchronized JSONObject step(String sql) throws Exception {
        JSONObject result=query(sql,40);
        JSONArray rows=result.getJSONArray("rows"),columns=result.getJSONArray("columns");
        Set<String> names=new HashSet<>();for(int i=0;i<columns.length();i++)names.add(columns.getString(i));
        List<JSONObject> decisions=new ArrayList<>();Set<Integer> used=new HashSet<>();
        if(names.contains("action")&&names.contains("x")&&names.contains("y")){
            for(int i=0;i<rows.length()&&used.size()<2;i++){
                JSONObject row=rows.getJSONObject(i);
                int rid=names.contains("robot_id")?row.getInt("robot_id"):1;
                String action=row.getString("action").trim().toUpperCase(Locale.ROOT);
                int x=row.getInt("x"),y=row.getInt("y");
                if(used.contains(rid))continue;
                if(!("MINE".equals(action)||"DELIVER".equals(action)||"CHARGE".equals(action)))
                    throw new IllegalArgumentException("Acciones permitidas: MINE, DELIVER, CHARGE");
                if(x<0||y<0||x>=WIDTH||y>=HEIGHT||blocked.contains(pos(x,y)))
                    throw new IllegalArgumentException("Coordenadas fuera de zona transitable");
                if(robot(rid)==null)throw new IllegalArgumentException("Robot inexistente: "+rid);
                JSONObject decision=new JSONObject();decision.put("robot_id",rid);decision.put("action",action);
                decision.put("x",x);decision.put("y",y);decisions.add(decision);used.add(rid);
            }
        }else if(names.contains("action")){
            throw new IllegalArgumentException("Se requieren columnas action, x, y y opcionalmente robot_id");
        }
        List<String> messages=new ArrayList<>();
        db.beginTransaction();
        try{
            int tick=meta("tick")+1;putMeta("tick",tick);
            if(tick%34==0){
                exec("UPDATE resource_nodes SET stock=MIN(max_stock,stock+1)");
                event(tick,"REGEN","Depósitos minerales regenerados",null,null);
            }
            for(JSONObject d:decisions){
                int rid=d.getInt("robot_id"),x=d.getInt("x"),y=d.getInt("y");
                String action=d.getString("action");JSONObject r=robot(rid);
                if(r.getInt("energy")<=0&&!"CHARGE".equals(action)){
                    exec("UPDATE robots SET status='LOW BATTERY' WHERE id=?",rid);continue;
                }
                List<Integer> path=path(r.getInt("x"),r.getInt("y"),x,y);
                if(path.isEmpty()){messages.add(r.getString("name")+" · ruta no disponible");continue;}
                if(path.size()>1){
                    int next=path.get(1),nx=next%WIDTH,ny=next/WIDTH;
                    String heading=nx>r.getInt("x")?"E":nx<r.getInt("x")?"W":ny>r.getInt("y")?"S":"N";
                    exec("UPDATE robots SET x=?,y=?,heading=?,status=?,energy=MAX(0,energy-1) WHERE id=?",
                        nx,ny,heading,action,rid);
                    messages.add(r.getString("name")+" → "+action+" ("+x+","+y+")");
                }else{
                    messages.add(act(tick,r,action,x,y));
                    exec("UPDATE robots SET status=? WHERE id=?",action,rid);
                }
            }
            if(decisions.isEmpty())messages.add("Sin órdenes · ejecuta una consulta con action, x, y");
            putMeta("level",1+meta("delivered")/8);
            db.setTransactionSuccessful();
        }finally {db.endTransaction();}
        JSONObject out=new JSONObject();out.put("message",android.text.TextUtils.join(" · ",messages));
        out.put("decisions",new JSONArray(decisions));out.put("result",result);
        out.put("tick",meta("tick"));out.put("state",snapshot());return out;
    }
    public synchronized void reset(){close();context.deleteDatabase("nexus.db");open();}
    public synchronized void close(){if(db!=null && db.isOpen())db.close();}
}
