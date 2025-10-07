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

    // Retrieves all active form configurations with display labels for form selection UI
    @AuraEnabled(cacheable=true)
    public static List<FormBadge> getForms() {
        try {
            // Query active form configurations in user mode for FLS enforcement
            String soql = 'SELECT Id, Name, Object_Name__c, Record_Type_Name__c, Field_Analysis_Details__c ' +
                          'FROM Dynamic_Field_Analysis__c ' +
                          'WHERE Name != null AND Object_Name__c != null AND IsActive__c = true ' +
                          'ORDER BY Name';

            List<SObject> rows = Database.query(soql);
            List<FormBadge> out = new List<FormBadge>();

            for (SObject sob : rows) {
                Dynamic_Field_Analysis__c rec = (Dynamic_Field_Analysis__c)sob;
                // Build subtitle with object name and record type (if not Master)
                String subtitle = rec.Object_Name__c;
                if (String.isNotBlank(rec.Record_Type_Name__c) && rec.Record_Type_Name__c != 'Master') {
                    subtitle += ' • ' + rec.Record_Type_Name__c;
                }
                out.add(new FormBadge(rec.Id, rec.Name, subtitle, rec.Field_Analysis_Details__c));
            }

            return out;
        } catch (Exception e) {
            throw new AuraHandledException('Failed to load forms: ' + e.getMessage());
        }
    }
}