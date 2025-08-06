public with sharing class FieldAnalysisService {
    
    public class ObjectOption {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
        public ObjectOption(String label, String value) {
            this.label = label;
            this.value = value;
        }
    }
    
    public class RecordTypeOption {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
        @AuraEnabled public String description;
        @AuraEnabled public Boolean isDefault;
        public RecordTypeOption(String label, String value, String description, Boolean isDefault) {
            this.label = label;
            this.value = value;
            this.description = description;
            this.isDefault = isDefault;
        }
    }
    
    public class FieldOption {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
        @AuraEnabled public String type;
        @AuraEnabled public Boolean required;
        public FieldOption(String label, String value, String type, Boolean required) {
            this.label = label;
            this.value = value;
            this.type = type;
            this.required = required;
        }
    }
    
    public class FieldAnalysisDetail {
        @AuraEnabled public String fieldName;
        @AuraEnabled public String fieldLabel;
        @AuraEnabled public String fieldType;
        @AuraEnabled public Boolean isRequired;
        @AuraEnabled public Integer length;
        @AuraEnabled public Integer precision;
        @AuraEnabled public Integer scale;
        @AuraEnabled public List<String> picklistValues;
        @AuraEnabled public String helpText;
        @AuraEnabled public String relationshipName;
        @AuraEnabled public String referenceTo;
        @AuraEnabled public Boolean isCustom;
        @AuraEnabled public Boolean isUpdateable;
        @AuraEnabled public Boolean isCreateable;
        
        public FieldAnalysisDetail() {
            this.picklistValues = new List<String>();
        }
    }
    
    @AuraEnabled(cacheable=true)
    public static List<ObjectOption> getAllSalesforceObjects() {
        List<ObjectOption> objectOptions = new List<ObjectOption>();
        
        try {
            Console.log('getAllSalesforceObjects: Starting to retrieve objects');
            Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
            Console.log('getAllSalesforceObjects: Found ' + globalDescribe.size() + ' total objects');
            
            for (String objectName : globalDescribe.keySet()) {
                Schema.DescribeSObjectResult objectDescribe = globalDescribe.get(objectName).getDescribe();
                
                // Only include objects that are accessible, createable, and not deprecated
                if (objectDescribe.isAccessible() && 
                    objectDescribe.isCreateable() && 
                    !objectDescribe.isDeprecatedAndHidden()) {
                    
                    objectOptions.add(new ObjectOption(objectDescribe.getLabel(), objectDescribe.getName()));
                }
            }
            
            // Note: Sorting removed to fix Comparable interface issue
            // objectOptions.sort();
            Console.log('getAllSalesforceObjects: Returning ' + objectOptions.size() + ' accessible objects');
            
        } catch (Exception e) {
            Console.log('Error in getAllSalesforceObjects: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to retrieve Salesforce objects: ' + e.getMessage());
        }
        
        return objectOptions;
    }
    
    @AuraEnabled(cacheable=true)
    public static List<RecordTypeOption> getObjectRecordTypes(String objectName) {
        List<RecordTypeOption> recordTypeOptions = new List<RecordTypeOption>();
        
        try {
            Console.log('getObjectRecordTypes: Starting for object ' + objectName);
            if (String.isBlank(objectName)) {
                throw new IllegalArgumentException('Object name cannot be blank');
            }
            
            Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectName);
            if (objectType == null) {
                throw new IllegalArgumentException('Invalid object name: ' + objectName);
            }
            
            Schema.DescribeSObjectResult objectDescribe = objectType.getDescribe();
            Map<String, Schema.RecordTypeInfo> recordTypeInfoMap = objectDescribe.getRecordTypeInfosByDeveloperName();
            Console.log('getObjectRecordTypes: Found ' + recordTypeInfoMap.size() + ' record types');
            
            // If no record types or only Master record type, return Master
            if (recordTypeInfoMap.isEmpty() || recordTypeInfoMap.size() == 1) {
                for (Schema.RecordTypeInfo rtInfo : recordTypeInfoMap.values()) {
                    if (rtInfo.isMaster() && rtInfo.isAvailable()) {
                        recordTypeOptions.add(new RecordTypeOption(
                            rtInfo.getName(), 
                            rtInfo.getRecordTypeId(), 
                            'Master record type', 
                            true
                        ));
                        break;
                    }
                }
            } else {
                // Multiple record types exist
                for (Schema.RecordTypeInfo rtInfo : recordTypeInfoMap.values()) {
                    if (rtInfo.isAvailable()) {
                        String description = rtInfo.isMaster() ? 'Master record type' : 'Custom record type';
                        recordTypeOptions.add(new RecordTypeOption(
                            rtInfo.getName(), 
                            rtInfo.getRecordTypeId(), 
                            description, 
                            rtInfo.isDefaultRecordTypeMapping()
                        ));
                    }
                }
            }
            
            // Note: Sorting removed to fix Comparable interface issue
            // recordTypeOptions.sort(new RecordTypeComparator());
            
        } catch (Exception e) {
            Console.log('Error in getObjectRecordTypes: ' + e.getMessage());
            throw new AuraHandledException('Failed to retrieve record types for ' + objectName + ': ' + e.getMessage());
        }
        
        return recordTypeOptions;
    }
    
    @AuraEnabled(cacheable=true)
    public static List<FieldOption> getObjectFields(String objectName, String recordTypeId) {
        List<FieldOption> fieldOptions = new List<FieldOption>();
        
        try {
            if (String.isBlank(objectName)) {
                throw new IllegalArgumentException('Object name cannot be blank');
            }
            
            Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectName);
            if (objectType == null) {
                throw new IllegalArgumentException('Invalid object name: ' + objectName);
            }
            
            Schema.DescribeSObjectResult objectDescribe = objectType.getDescribe();
            Map<String, Schema.SObjectField> fieldsMap = objectDescribe.fields.getMap();
            
            for (String fieldName : fieldsMap.keySet()) {
                Schema.DescribeFieldResult fieldDescribe = fieldsMap.get(fieldName).getDescribe();
                
                // Only include fields that are accessible, createable or updateable, and not deprecated
                if (fieldDescribe.isAccessible() && 
                    (fieldDescribe.isCreateable() || fieldDescribe.isUpdateable()) &&
                    !fieldDescribe.isDeprecatedAndHidden()) {
                    
                    // Check if field is available for the specific record type
                    if (String.isNotBlank(recordTypeId)) {
                        List<Schema.PicklistEntry> picklistValues = fieldDescribe.getPicklistValues();
                        Boolean fieldAvailableForRecordType = true;
                        
                        // For picklist fields, check if they have values for this record type
                        if (fieldDescribe.getType() == Schema.DisplayType.PICKLIST || 
                            fieldDescribe.getType() == Schema.DisplayType.MULTIPICKLIST) {
                            
                            Boolean hasValuesForRecordType = false;
                            for (Schema.PicklistEntry entry : picklistValues) {
                                if (entry.isActive()) {
                                    hasValuesForRecordType = true;
                                    break;
                                }
                            }
                            fieldAvailableForRecordType = hasValuesForRecordType;
                        }
                        
                        if (!fieldAvailableForRecordType) {
                            continue;
                        }
                    }
                    
                    String fieldType = String.valueOf(fieldDescribe.getType());
                    Boolean isRequired = !fieldDescribe.isNillable() && 
                                       !fieldDescribe.isDefaultedOnCreate() && 
                                       fieldDescribe.isCreateable();
                    
                    fieldOptions.add(new FieldOption(
                        fieldDescribe.getLabel(), 
                        fieldDescribe.getName(), 
                        fieldType, 
                        isRequired
                    ));
                }
            }
            
            // Note: Sorting removed to fix Comparable interface issue
            // fieldOptions.sort(new FieldOptionComparator());
            
        } catch (Exception e) {
            Console.log('Error in getObjectFields: ' + e.getMessage());
            throw new AuraHandledException('Failed to retrieve fields for ' + objectName + ': ' + e.getMessage());
        }
        
        return fieldOptions;
    }
    
    @AuraEnabled
    public static List<FieldAnalysisDetail> analyzeSelectedFields(String objectName, String recordTypeId, List<String> selectedFieldNames) {
        List<FieldAnalysisDetail> analysisDetails = new List<FieldAnalysisDetail>();
        
        try {
            Console.log('analyzeSelectedFields: Starting analysis');
            Console.log('Parameters - objectName: ' + objectName);
            Console.log('Parameters - recordTypeId: ' + recordTypeId);
            Console.log('Parameters - selectedFieldNames: ' + selectedFieldNames);
            
            if (String.isBlank(objectName)) {
                throw new IllegalArgumentException('Object name cannot be blank');
            }
            
            if (selectedFieldNames == null || selectedFieldNames.isEmpty()) {
                throw new IllegalArgumentException('Selected field names cannot be empty');
            }
            
            Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectName);
            if (objectType == null) {
                throw new IllegalArgumentException('Invalid object name: ' + objectName);
            }
            
            Schema.DescribeSObjectResult objectDescribe = objectType.getDescribe();
            Map<String, Schema.SObjectField> fieldsMap = objectDescribe.fields.getMap();
            
            Console.log('analyzeSelectedFields: Found ' + fieldsMap.size() + ' fields in fieldsMap');
            Console.log('analyzeSelectedFields: fieldsMap keys: ' + new List<String>(fieldsMap.keySet()));
            
            for (String fieldName : selectedFieldNames) {
                Console.log('analyzeSelectedFields: Processing field: ' + fieldName);
                Console.log('analyzeSelectedFields: fieldsMap contains field: ' + fieldsMap.containsKey(fieldName));
                
                // Try lowercase version as Salesforce field maps are case-insensitive but lowercase
                String lowercaseFieldName = fieldName.toLowerCase();
                Console.log('analyzeSelectedFields: Trying lowercase: ' + lowercaseFieldName);
                Console.log('analyzeSelectedFields: fieldsMap contains lowercase field: ' + fieldsMap.containsKey(lowercaseFieldName));
                
                Schema.SObjectField fieldToken = fieldsMap.get(lowercaseFieldName);
                if (fieldToken != null) {
                    Schema.DescribeFieldResult fieldDescribe = fieldToken.getDescribe();
                    
                    Console.log('analyzeSelectedFields: Successfully found field token for: ' + fieldName);
                    
                    FieldAnalysisDetail detail = new FieldAnalysisDetail();
                    detail.fieldName = fieldDescribe.getName();
                    detail.fieldLabel = fieldDescribe.getLabel();
                    detail.fieldType = String.valueOf(fieldDescribe.getType());
                    detail.isRequired = !fieldDescribe.isNillable() && 
                                      !fieldDescribe.isDefaultedOnCreate() && 
                                      fieldDescribe.isCreateable();
                    detail.helpText = fieldDescribe.getInlineHelpText();
                    detail.isCustom = fieldDescribe.isCustom();
                    detail.isUpdateable = fieldDescribe.isUpdateable();
                    detail.isCreateable = fieldDescribe.isCreateable();
                    
                    Console.log('analyzeSelectedFields: Created detail for field: ' + detail.fieldName + 
                               ', label: ' + detail.fieldLabel + ', type: ' + detail.fieldType);
                    
                    // Set length, precision, scale based on field type
                    if (fieldDescribe.getType() == Schema.DisplayType.STRING || 
                        fieldDescribe.getType() == Schema.DisplayType.TEXTAREA) {
                        detail.length = fieldDescribe.getLength();
                    } else if (fieldDescribe.getType() == Schema.DisplayType.DOUBLE || 
                              fieldDescribe.getType() == Schema.DisplayType.CURRENCY || 
                              fieldDescribe.getType() == Schema.DisplayType.PERCENT) {
                        detail.precision = fieldDescribe.getPrecision();
                        detail.scale = fieldDescribe.getScale();
                    }
                    
                    // Handle picklist fields with record type specific values
                    if (fieldDescribe.getType() == Schema.DisplayType.PICKLIST || 
                        fieldDescribe.getType() == Schema.DisplayType.MULTIPICKLIST) {
                        
                        List<Schema.PicklistEntry> allPicklistValues = fieldDescribe.getPicklistValues();
                        for (Schema.PicklistEntry entry : allPicklistValues) {
                            if (entry.isActive()) {
                                detail.picklistValues.add(entry.getLabel() + ' (' + entry.getValue() + ')');
                            }
                        }
                    }
                    
                    // Handle lookup/master-detail relationships
                    if (fieldDescribe.getType() == Schema.DisplayType.REFERENCE) {
                        detail.relationshipName = fieldDescribe.getRelationshipName();
                        List<Schema.sObjectType> referenceTo = fieldDescribe.getReferenceTo();
                        if (!referenceTo.isEmpty()) {
                            detail.referenceTo = String.valueOf(referenceTo[0]);
                        }
                    }
                    
                    analysisDetails.add(detail);
                    Console.log('analyzeSelectedFields: Added detail to list, total count: ' + analysisDetails.size());
                } else {
                    Console.log('analyzeSelectedFields: Field not found in fieldsMap: ' + fieldName);
                }
            }
            
        } catch (Exception e) {
            Console.log('Error in analyzeSelectedFields: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to analyze selected fields: ' + e.getMessage());
        }
        
        Console.log('analyzeSelectedFields: Returning ' + analysisDetails.size() + ' field analysis details');
        return analysisDetails;
    }
    
    @AuraEnabled
    public static String analyzeFieldsAndGenerateReport(String objectName, String recordTypeId, String recordTypeName, List<String> selectedFieldNames) {
        try {
            Console.log('analyzeFieldsAndGenerateReport: Starting combined analysis and report generation');
            
            // First get the field analysis details
            List<FieldAnalysisDetail> fieldDetails = analyzeSelectedFields(objectName, recordTypeId, selectedFieldNames);
            
            Console.log('analyzeFieldsAndGenerateReport: Got ' + fieldDetails.size() + ' field details');
            
            // Then generate the report using those details
            String report = generateFieldAnalysisReport(objectName, recordTypeName, fieldDetails);
            
            Console.log('analyzeFieldsAndGenerateReport: Generated report successfully');
            
            return report;
            
        } catch (Exception e) {
            Console.log('Error in analyzeFieldsAndGenerateReport: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to analyze fields and generate report: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static String generateFieldAnalysisReport(String objectName, String recordTypeName, List<FieldAnalysisDetail> fieldDetails) {
        try {
            Console.log('generateFieldAnalysisReport: Starting report generation');
            Console.log('Parameters - objectName: ' + objectName + ', recordTypeName: ' + recordTypeName);
            Console.log('fieldDetails parameter is null: ' + (fieldDetails == null));
            Console.log('fieldDetails size: ' + (fieldDetails != null ? fieldDetails.size() : 0));
            
            if (fieldDetails != null && !fieldDetails.isEmpty()) {
                for (Integer i = 0; i < fieldDetails.size(); i++) {
                    FieldAnalysisDetail detail = fieldDetails[i];
                    Console.log('Field detail ' + i + ': ' + 
                               'fieldName=' + detail.fieldName + 
                               ', fieldLabel=' + detail.fieldLabel + 
                               ', fieldType=' + detail.fieldType +
                               ', isRequired=' + detail.isRequired);
                }
            }
            
            if (fieldDetails == null) {
                throw new IllegalArgumentException('Field details list cannot be null');
            }
            
            String report = '';
            
            Integer counter = 1;
            for (FieldAnalysisDetail detail : fieldDetails) {
                if (detail == null) {
                    Console.log('Skipping null field detail at index: ' + counter);
                    continue;
                }
                
                String fieldLabel = detail.fieldLabel != null ? detail.fieldLabel : 'Unknown Field';
                String fieldType = detail.fieldType != null ? detail.fieldType : 'Unknown Type';
                String fieldName = detail.fieldName != null ? detail.fieldName : 'unknown_field';
                Boolean isRequired = detail.isRequired != null ? detail.isRequired : false;
                
                report += counter + '. ' + fieldLabel + ' (' + fieldType;
                if (isRequired) {
                    report += ' - Required';
                } else {
                    report += ' - Optional';
                }
                report += ')\n';
                
                report += '   API Name: ' + fieldName + '\n';
                report += '   Type: ' + fieldType + '\n';
                
                if (detail.length != null) {
                    report += '   Max Length: ' + detail.length + ' characters\n';
                }
                if (detail.precision != null) {
                    report += '   Precision: ' + detail.precision + ' digits';
                    if (detail.scale != null) {
                        report += ', Scale: ' + detail.scale + ' decimal places';
                    }
                    report += '\n';
                }
                
                if (detail.picklistValues != null && !detail.picklistValues.isEmpty()) {
                    report += '   Picklist Values:\n';
                    for (String value : detail.picklistValues) {
                        report += '   - ' + (value != null ? value : 'null value') + '\n';
                    }
                }
                
                if (String.isNotBlank(detail.relationshipName)) {
                    report += '   Relationship: ' + detail.relationshipName + '\n';
                    if (String.isNotBlank(detail.referenceTo)) {
                        report += '   References: ' + detail.referenceTo + '\n';
                    }
                }
                
                if (String.isNotBlank(detail.helpText)) {
                    report += '   Help Text: ' + detail.helpText + '\n';
                }
                
                report += '   Editable: ' + (detail.isUpdateable != null && detail.isUpdateable ? 'Yes' : 'No') + '\n';
                report += '\n';
                
                counter++;
            }
            
            return report;
            
        } catch (Exception e) {
            Console.log('Error in generateFieldAnalysisReport: ' + e.getMessage());
            throw new AuraHandledException('Failed to generate analysis report: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static String createAnalysisRecord(String objectName, String recordTypeName, String recordTypeId, 
                                            List<String> selectedFields, String analysisDetails) {
        try {
            if (String.isBlank(objectName)) {
                throw new IllegalArgumentException('Object name cannot be blank');
            }
            
            if (selectedFields == null || selectedFields.isEmpty()) {
                throw new IllegalArgumentException('Selected fields cannot be empty');
            }
            
            if (String.isBlank(analysisDetails)) {
                throw new IllegalArgumentException('Analysis details cannot be blank');
            }
            
            // Create the Dynamic Field Analysis record
            Dynamic_Field_Analysis__c analysisRecord = new Dynamic_Field_Analysis__c();
            analysisRecord.Object_Name__c = objectName;
            analysisRecord.Record_Type_Name__c = recordTypeName;
            analysisRecord.Record_Type_Id__c = recordTypeId;
            analysisRecord.Selected_Fields__c = String.join(selectedFields, ', ');
            analysisRecord.Field_Analysis_Details__c = analysisDetails;
            analysisRecord.Analysis_Date__c = DateTime.now();
            analysisRecord.Total_Fields_Count__c = selectedFields.size();
            
            insert analysisRecord;
            
            Console.log('Successfully created Dynamic Field Analysis record with ID: ' + analysisRecord.Id);
            
            return analysisRecord.Id;
            
        } catch (Exception e) {
            Console.log('Error in createAnalysisRecord: ' + e.getMessage());
            throw new AuraHandledException('Failed to create analysis record: ' + e.getMessage());
        }
    }
    
    // Comparator to sort field options by label
    public class FieldOptionComparator implements Comparator<FieldOption> {
        public Integer compare(FieldOption field1, FieldOption field2) {
            return field1.label.compareTo(field2.label);
        }
    }
    
    // Comparator to sort record types with default first
    public class RecordTypeComparator implements Comparator<RecordTypeOption> {
        public Integer compare(RecordTypeOption rt1, RecordTypeOption rt2) {
            if (rt1.isDefault && !rt2.isDefault) return -1;
            if (!rt1.isDefault && rt2.isDefault) return 1;
            return rt1.label.compareTo(rt2.label);
        }
    }
}