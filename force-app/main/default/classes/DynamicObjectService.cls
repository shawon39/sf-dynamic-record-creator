public with sharing class DynamicObjectService {
    public class ObjectOption {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
        public ObjectOption(String label, String value) {
            this.label = label;
            this.value = value;
        }
        
    }

    @AuraEnabled(cacheable=true)
    public static List<ObjectOption> getAllCreateableObjects() {
        // Only allow these three objects
        List<ObjectOption> opts = new List<ObjectOption>();
        Map<String, Schema.SObjectType> gd = Schema.getGlobalDescribe();
        Map<String, String> allowed = new Map<String, String>{
            'Account' => 'Account',
            'Opportunity' => 'Opportunity',
            'Contact' => 'Contact'
        };
        for (String objName : allowed.keySet()) {
            Schema.DescribeSObjectResult dr = gd.get(objName).getDescribe();
            if (dr.isCreateable()) {
                opts.add(new ObjectOption(dr.getLabel(), dr.getName()));
            }
        }
        return opts;
    }
} 