public with sharing class DynamicObjectService {
    public class ObjectOption implements Comparable {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
        public ObjectOption(String label, String value) {
            this.label = label;
            this.value = value;
        }
        
        public Integer compareTo(Object other) {
            ObjectOption otherOption = (ObjectOption) other;
            return this.label.toLowerCase().compareTo(otherOption.label.toLowerCase());
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<ObjectOption> getAllCreateableObjects() {
        Map<String, Schema.SObjectType> gd = Schema.getGlobalDescribe();
        List<ObjectOption> opts = new List<ObjectOption>();
        for (Schema.SObjectType sObjType : gd.values()) {
            Schema.DescribeSObjectResult dr = sObjType.getDescribe();
            if (dr.isCreateable()) {
                opts.add(new ObjectOption(dr.getLabel(), dr.getName()));
            }
        }
        // Sort by label
        opts.sort();
        return opts;
    }
} 