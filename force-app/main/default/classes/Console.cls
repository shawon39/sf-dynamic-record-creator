public with sharing class Console {
    public static void log(Object obj) {
        System.debug(JSON.serializePretty(obj));
    }
    
    public static void log(String label, Object obj) {
        System.debug(label);
        System.debug(JSON.serializePretty(obj));
    }
}