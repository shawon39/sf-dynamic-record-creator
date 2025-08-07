public with sharing class FieldService {
    
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
        @AuraEnabled public String referenceTo;
        @AuraEnabled public Boolean isCreateable;
        @AuraEnabled public String defaultValue;
        @AuraEnabled public Boolean isFormula;
        @AuraEnabled public String controllingField;
        @AuraEnabled public Boolean isDependentPicklist;
        @AuraEnabled public Boolean isUnique;
        @AuraEnabled public Boolean isEncrypted;
        
        public FieldAnalysisDetail() {
            this.picklistValues = new List<String>();
        }
    }
    
    
    public class FieldAnalysisResult {
        @AuraEnabled public String analysisReport;
        @AuraEnabled public List<FieldAnalysisDetail> fieldDetails;
        
        public FieldAnalysisResult() {
            this.fieldDetails = new List<FieldAnalysisDetail>();
        }
    }
    
    @AuraEnabled(cacheable=true)
    public static List<FieldOption> getObjectFields(String objectName) {
        List<FieldOption> fieldOptions = new List<FieldOption>();
        
        try {
            Console.log('FieldService.getObjectFields: Starting for object ' + objectName);
            
            if (String.isBlank(objectName)) {
                throw new IllegalArgumentException('Object name cannot be blank');
            }
            
            Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectName);
            if (objectType == null) {
                throw new IllegalArgumentException('Invalid object name: ' + objectName);
            }
            
            Schema.DescribeSObjectResult objectDescribe = objectType.getDescribe();
            Map<String, Schema.SObjectField> fieldMap = objectDescribe.fields.getMap();
            
            for (String fieldName : fieldMap.keySet()) {
                Schema.DescribeFieldResult fieldDescribe = fieldMap.get(fieldName).getDescribe();
                
                // Include accessible and createable fields (excluding system fields like Id, CreatedDate, etc.)
                if (fieldDescribe.isAccessible() && 
                    fieldDescribe.isCreateable() && 
                    !isSystemField(fieldName)) {
                    
                    fieldOptions.add(new FieldOption(
                        fieldDescribe.getLabel(),
                        fieldDescribe.getName(),
                        String.valueOf(fieldDescribe.getType()),
                        !fieldDescribe.isNillable() && !fieldDescribe.isDefaultedOnCreate()
                    ));
                }
            }
            
            // Sort fields alphabetically
            fieldOptions.sort(new FieldOptionComparator());
            
            Console.log('FieldService.getObjectFields: Found ' + fieldOptions.size() + ' accessible fields');
            
        } catch (Exception e) {
            Console.log('Error in FieldService.getObjectFields: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to retrieve object fields: ' + e.getMessage());
        }
        
        return fieldOptions;
    }
    
    @AuraEnabled
    public static FieldAnalysisResult analyzeFieldsAndGenerateReport(String objectName, List<String> selectedFields) {
        FieldAnalysisResult result = new FieldAnalysisResult();
        
        try {
            Console.log('FieldService.analyzeFieldsAndGenerateReport: Starting analysis for ' + objectName);
            Console.log('FieldService.analyzeFieldsAndGenerateReport: Analyzing ' + selectedFields.size() + ' fields');
            
            if (String.isBlank(objectName)) {
                throw new IllegalArgumentException('Object name cannot be blank');
            }
            
            if (selectedFields == null || selectedFields.isEmpty()) {
                throw new IllegalArgumentException('Selected fields cannot be empty');
            }
            
            Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectName);
            if (objectType == null) {
                throw new IllegalArgumentException('Invalid object name: ' + objectName);
            }
            
            Schema.DescribeSObjectResult objectDescribe = objectType.getDescribe();
            Map<String, Schema.SObjectField> fieldMap = objectDescribe.fields.getMap();
            
            
            // Analyze each selected field
            for (String fieldName : selectedFields) {
                Schema.SObjectField field = fieldMap.get(fieldName);
                if (field != null) {
                    Schema.DescribeFieldResult fieldDescribe = field.getDescribe();
                    
                    // Create detailed field analysis
                    FieldAnalysisDetail detail = new FieldAnalysisDetail();
                    detail.fieldName = fieldDescribe.getName();
                    detail.fieldLabel = fieldDescribe.getLabel();
                    detail.fieldType = String.valueOf(fieldDescribe.getType());
                    detail.isRequired = !fieldDescribe.isNillable() && !fieldDescribe.isDefaultedOnCreate();
                    detail.length = fieldDescribe.getLength();
                    detail.precision = fieldDescribe.getPrecision();
                    detail.scale = fieldDescribe.getScale();
                    detail.isCreateable = fieldDescribe.isCreateable();
                    detail.defaultValue = fieldDescribe.getDefaultValue() != null ? String.valueOf(fieldDescribe.getDefaultValue()) : null;
                    detail.isFormula = fieldDescribe.isCalculated();
                    detail.isEncrypted = fieldDescribe.isEncrypted();
                    detail.isUnique = fieldDescribe.isUnique();
                    
                    // Enhanced field type analysis
                    Schema.DisplayType fieldType = fieldDescribe.getType();
                    
                    if (fieldType == Schema.DisplayType.PICKLIST || fieldType == Schema.DisplayType.MULTIPICKLIST) {
                        List<Schema.PicklistEntry> picklistValues = fieldDescribe.getPicklistValues();
                        detail.isDependentPicklist = fieldDescribe.isDependentPicklist();
                        
                        // Check for controlling field
                        if (detail.isDependentPicklist) {
                            Schema.sObjectField controllingField = fieldDescribe.getController();
                            if (controllingField != null) {
                                detail.controllingField = controllingField.getDescribe().getName();
                            }
                        }
                        
                        // Get active picklist values
                        for (Schema.PicklistEntry entry : picklistValues) {
                            if (entry.isActive()) {
                                detail.picklistValues.add(entry.getLabel());
                            }
                        }
                    } else if (fieldType == Schema.DisplayType.REFERENCE) {
                        List<Schema.SObjectType> references = fieldDescribe.getReferenceTo();
                        if (!references.isEmpty()) {
                            detail.referenceTo = references[0].getDescribe().getName();
                        }
                    }
                    
                    result.fieldDetails.add(detail);
                }
            }
            
            // Generate AI-friendly analysis report only
            result.analysisReport = generateAIFriendlyAnalysisReport(objectName, result.fieldDetails);
            
            Console.log('FieldService.analyzeFieldsAndGenerateReport: Analysis completed successfully');
            
        } catch (Exception e) {
            Console.log('Error in FieldService.analyzeFieldsAndGenerateReport: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to analyze fields: ' + e.getMessage());
        }
        
        return result;
    }
    
    private static String generateAIFriendlyAnalysisReport(String objectName, List<FieldAnalysisDetail> fieldDetails) {
        List<String> report = new List<String>();
        
        // Object header
        Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectName);
        String objectLabel = objectType != null ? objectType.getDescribe().getLabel() : objectName;
        
        report.add('Object Name: ' + objectLabel);
        report.add('Object API Name: ' + objectName);
        report.add('');
        report.add('Fields Details:');
        report.add('');
        
        // Process each field with smart type-specific formatting
        for (FieldAnalysisDetail field : fieldDetails) {
            report.add('Name: ' + field.fieldLabel);
            report.add('API Name: ' + field.fieldName);
            report.add('Data Type: ' + formatDataType(field.fieldType));
            
            // Required status
            String requiredStatus = field.isRequired ? 'Yes' : 'No';
            if (field.isFormula) {
                requiredStatus += ' (System Formula)';
            } else if (!field.isCreateable) {
                requiredStatus += ' (System)';
            }
            report.add('Required: ' + requiredStatus);
            
            // Default value
            if (field.defaultValue != null && String.isNotBlank(field.defaultValue)) {
                report.add('Default Value: ' + field.defaultValue);
            }
            
            // Type-specific attributes
            addTypeSpecificAttributes(report, field);
            
            report.add('');
        }
        
        return String.join(report, '\n');
    }
    
    private static String formatDataType(String fieldType) {
        // Convert internal field types to more readable format
        Map<String, String> typeMap = new Map<String, String>{
            'STRING' => 'Text',
            'TEXTAREA' => 'Text Area',
            'INTEGER' => 'Number',
            'DOUBLE' => 'Number',
            'CURRENCY' => 'Currency',
            'PERCENT' => 'Percent',
            'DATE' => 'Date',
            'DATETIME' => 'DateTime',
            'TIME' => 'Time',
            'BOOLEAN' => 'Checkbox',
            'PICKLIST' => 'Picklist',
            'MULTIPICKLIST' => 'Multi-Select Picklist',
            'REFERENCE' => 'Lookup',
            'EMAIL' => 'Email',
            'PHONE' => 'Phone',
            'URL' => 'URL'
        };
        
        return typeMap.containsKey(fieldType) ? typeMap.get(fieldType) : fieldType;
    }
    
    private static void addTypeSpecificAttributes(List<String> report, FieldAnalysisDetail field) {
        String fieldType = field.fieldType;
        
        // Text fields - show length limit
        if (fieldType == 'STRING' || fieldType == 'TEXTAREA' || fieldType == 'EMAIL' || 
            fieldType == 'URL' || fieldType == 'PHONE') {
            if (field.length != null && field.length > 0) {
                report.add('Max Length: ' + field.length);
            }
        }
        
        // Number/Currency fields - show precision and scale
        else if (fieldType == 'INTEGER' || fieldType == 'DOUBLE' || 
                 fieldType == 'CURRENCY' || fieldType == 'PERCENT') {
            if (field.precision != null && field.precision > 0) {
                report.add('Precision: ' + field.precision);
                if (field.scale != null && field.scale > 0) {
                    report.add('Scale: ' + field.scale);
                }
            }
        }
        
        // Picklist fields - show available values
        else if ((fieldType == 'PICKLIST' || fieldType == 'MULTIPICKLIST') && 
                 field.picklistValues != null && !field.picklistValues.isEmpty()) {
            report.add('Values: ' + String.join(field.picklistValues, ', '));
            
            // Show if it's dependent on another field
            if (field.isDependentPicklist && field.controllingField != null) {
                report.add('Depends On: ' + field.controllingField);
            }
        }
        
        // Lookup fields - show referenced object
        else if (fieldType == 'REFERENCE' && field.referenceTo != null) {
            Schema.SObjectType refObject = Schema.getGlobalDescribe().get(field.referenceTo);
            String refLabel = refObject != null ? refObject.getDescribe().getLabel() : field.referenceTo;
            report.add('References: ' + refLabel + ' (' + field.referenceTo + ')');
        }
        
        // Formula fields - show read-only status
        if (field.isFormula) {
            report.add('Note: Read-only calculated field');
        }
        
        // Unique fields
        if (field.isUnique) {
            report.add('Unique: Yes');
        }
        
        // Encrypted fields
        if (field.isEncrypted) {
            report.add('Encrypted: Yes');
        }
    }
    
    
    private static Boolean isSystemField(String fieldName) {
        Set<String> systemFields = new Set<String>{
            'Id', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById',
            'SystemModstamp', 'LastActivityDate', 'LastViewedDate', 'LastReferencedDate'
        };
        return systemFields.contains(fieldName);
    }
    
    
    // Comparator to sort field options by label
    public class FieldOptionComparator implements Comparator<FieldOption> {
        public Integer compare(FieldOption field1, FieldOption field2) {
            return field1.label.compareTo(field2.label);
        }
    }
}