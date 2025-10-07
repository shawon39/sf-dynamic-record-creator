public with sharing class FormSelectorController {

    public class FormBadge {
        @AuraEnabled public String id;
        @AuraEnabled public String label;
        @AuraEnabled public String subtitle;
        @AuraEnabled public String fieldAnalysisDetails;

        public FormBadge(String id, String label, String subtitle, String fieldAnalysisDetails) {
            this.id = id;
            this.label = label;
            this.subtitle = subtitle;
            this.fieldAnalysisDetails = fieldAnalysisDetails;
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<FormBadge> getForms() {
        try {
            // Build SOQL for user-mode query - returns ALL active forms
            String soql = 'SELECT Id, Name, Object_Name__c, Record_Type_Name__c, Field_Analysis_Details__c ' +
                          'FROM Dynamic_Field_Analysis__c ' +
                          'WHERE Name != null AND Object_Name__c != null AND IsActive__c = true ' +
                          'ORDER BY Name';

            // Execute in USER_MODE to honor FLS + sharing without WITH SECURITY_ENFORCED
            List<SObject> rows = Database.query(soql);
            List<FormBadge> out = new List<FormBadge>();

            for (SObject sob : rows) {
                Dynamic_Field_Analysis__c rec = (Dynamic_Field_Analysis__c)sob;
                String subtitle = rec.Object_Name__c;
                if (String.isNotBlank(rec.Record_Type_Name__c) && rec.Record_Type_Name__c != 'Master') {
                    subtitle += ' • ' + rec.Record_Type_Name__c;
                }
                out.add(new FormBadge(rec.Id, rec.Name, subtitle, rec.Field_Analysis_Details__c));
            }

            return out;
        } catch (Exception e) {
            Console.log('Error in FormSelectorController.getForms: ' + e.getMessage());
            Console.log('Stack: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to load forms: ' + e.getMessage());
        }
    }
}