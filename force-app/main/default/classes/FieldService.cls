public with sharing class FieldService {
    
    // Wrapper class for field options used in picklists/dropdowns
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
    
    // Detailed metadata for a single field including type-specific properties
    public class FieldAnalysisDetail {
        @AuraEnabled public String fieldName;
        @AuraEnabled public String fieldLabel;
        @AuraEnabled public String fieldType;
        @AuraEnabled public String description;
        @AuraEnabled public Boolean isRequired;
        @AuraEnabled public Integer length;
        @AuraEnabled public List<String> picklistValues;
        @AuraEnabled public String referenceTo;
        @AuraEnabled public Boolean isCreateable;
        @AuraEnabled public String defaultValue;
        @AuraEnabled public String controllingField;
        @AuraEnabled public Boolean isDependentPicklist;
        
        public FieldAnalysisDetail() {
            this.picklistValues = new List<String>();
        }
    }
    
    // Result container with both structured data and formatted report
    public class FieldAnalysisResult {
        @AuraEnabled public String analysisReport;
        @AuraEnabled public List<FieldAnalysisDetail> fieldDetails;
        
        public FieldAnalysisResult() {
            this.fieldDetails = new List<FieldAnalysisDetail>();
        }
    }
    
    // Returns all createable fields for an object (excludes system fields)
    @AuraEnabled(cacheable=true)
    public static List<FieldOption> getObjectFields(String objectName) {
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
            Map<String, Schema.SObjectField> fieldMap = objectDescribe.fields.getMap();
            
            for (String fieldName : fieldMap.keySet()) {
                Schema.DescribeFieldResult fieldDescribe = fieldMap.get(fieldName).getDescribe();
                
                // Only include accessible, createable, non-system fields
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
            
            // Sort alphabetically for better UX
            fieldOptions.sort(new FieldOptionComparator());
            
        } catch (Exception e) {
            throw new AuraHandledException('Failed to retrieve object fields: ' + e.getMessage());
        }
        
        return fieldOptions;
    }
    
    // Analyzes fields and generates JSON report organized by sections
    @AuraEnabled
    public static FieldAnalysisResult analyzeFieldsAndGenerateJSONReport(String objectName, String recordTypeName, 
                                                                        String recordTypeId, List<String> selectedFields, 
                                                                        List<InstructionData> sections) {
        FieldAnalysisResult result = new FieldAnalysisResult();
        
        try {
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
            
            // Fetch field descriptions in bulk
            Set<String> fieldApiNames = new Set<String>(selectedFields);
            Map<String, String> fieldDescriptions = getFieldDescriptions(objectName, fieldApiNames);
            
            // Use map for fast field lookup when organizing by sections
            Map<String, FieldAnalysisDetail> fieldDetailsMap = new Map<String, FieldAnalysisDetail>();
            
            for (String fieldName : selectedFields) {
                Schema.SObjectField field = fieldMap.get(fieldName);
                if (field != null) {
                    Schema.DescribeFieldResult fieldDescribe = field.getDescribe();
                    
                    // Build detailed field metadata (same as above method)
                    FieldAnalysisDetail detail = new FieldAnalysisDetail();
                    detail.fieldName = fieldDescribe.getName();
                    detail.fieldLabel = fieldDescribe.getLabel();
                    detail.fieldType = String.valueOf(fieldDescribe.getType());
                    detail.description = fieldDescriptions.get(fieldName);
                    detail.isRequired = !fieldDescribe.isNillable() && !fieldDescribe.isDefaultedOnCreate();
                    detail.length = fieldDescribe.getLength();
                    detail.isCreateable = fieldDescribe.isCreateable();
                    detail.defaultValue = fieldDescribe.getDefaultValue() != null ? String.valueOf(fieldDescribe.getDefaultValue()) : null;
                    
                    Schema.DisplayType fieldType = fieldDescribe.getType();
                    
                    // Handle picklist fields
                    if (fieldType == Schema.DisplayType.PICKLIST || fieldType == Schema.DisplayType.MULTIPICKLIST) {
                        List<Schema.PicklistEntry> picklistValues = fieldDescribe.getPicklistValues();
                        detail.isDependentPicklist = fieldDescribe.isDependentPicklist();
                        
                        if (detail.isDependentPicklist) {
                            Schema.sObjectField controllingField = fieldDescribe.getController();
                            if (controllingField != null) {
                                detail.controllingField = controllingField.getDescribe().getName();
                            }
                        }
                        
                        for (Schema.PicklistEntry entry : picklistValues) {
                            if (entry.isActive()) {
                                detail.picklistValues.add(entry.getLabel());
                            }
                        }
                    } else if (fieldType == Schema.DisplayType.REFERENCE) {
                        // Handle lookup fields
                        List<Schema.SObjectType> references = fieldDescribe.getReferenceTo();
                        if (!references.isEmpty()) {
                            detail.referenceTo = references[0].getDescribe().getName();
                        }
                    }
                    
                    fieldDetailsMap.put(detail.fieldName, detail);
                    result.fieldDetails.add(detail);
                }
            }
            
            // Generate JSON report organized by sections
            result.analysisReport = generateJSONAnalysisReport(objectName, recordTypeName, recordTypeId, 
                                                             fieldDetailsMap, sections);
            
        } catch (Exception e) {
            throw new AuraHandledException('Failed to analyze fields: ' + e.getMessage());
        }
        
        return result;
    }
    
    // Generates a human-readable text report of field analysis
    private static String generateAIFriendlyAnalysisReport(String objectName, List<FieldAnalysisDetail> fieldDetails) {
        List<String> report = new List<String>();
        
        Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectName);
        String objectLabel = objectType != null ? objectType.getDescribe().getLabel() : objectName;
        
        // Add object header
        report.add('Object Name: ' + objectLabel);
        report.add('Object API Name: ' + objectName);
        report.add('');
        report.add('Fields Details:');
        report.add('');
        
        // Format each field with type-specific details
        for (FieldAnalysisDetail field : fieldDetails) {
            report.add('Name: ' + field.fieldLabel);
            report.add('API Name: ' + field.fieldName);
            report.add('Data Type: ' + formatDataType(field.fieldType));
            
            String requiredStatus = field.isRequired ? 'Yes' : 'No';
            if (!field.isCreateable) {
                requiredStatus += ' (System)';
            }
            report.add('Required: ' + requiredStatus);
            
            if (field.defaultValue != null && String.isNotBlank(field.defaultValue)) {
                report.add('Default Value: ' + field.defaultValue);
            }
            
            addTypeSpecificAttributes(report, field);
            
            report.add('');
        }
        
        return String.join(report, '\n');
    }
    
    // Generates a JSON report organized by sections (used for external systems)
    private static String generateJSONAnalysisReport(String objectName, String recordTypeName, String recordTypeId,
                                                   Map<String, FieldAnalysisDetail> fieldDetailsMap, List<InstructionData> sections) {
        
        Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectName);
        String objectLabel = objectType != null ? objectType.getDescribe().getLabel() : objectName;
        
        Map<String, Object> jsonData = new Map<String, Object>();
        jsonData.put('objectName', objectLabel);
        jsonData.put('objectApiName', objectName);
        jsonData.put('recordTypeName', recordTypeName);
        jsonData.put('recordTypeId', recordTypeId);
        
        String fieldsDetailsJson = '';
        
        // Organize fields by sections if provided
        if (sections != null && !sections.isEmpty()) {
            List<InstructionData> sortedSections = new List<InstructionData>(sections);
            sortedSections.sort(new SectionComparator());
            
            List<String> sectionJsonParts = new List<String>();
            
            // Process each section and its fields
            for (InstructionData section : sortedSections) {
                String sectionName = section.text != null ? section.text : 'Unnamed Section';
                List<String> fieldJsonList = new List<String>();
                
                if (section.fields != null && !section.fields.isEmpty()) {
                    for (String fieldName : section.fields) {
                        FieldAnalysisDetail fieldDetail = fieldDetailsMap.get(fieldName);
                        // Exclude lookup fields from JSON output
                        if (fieldDetail != null && !isLookupFieldType(fieldDetail.fieldType)) {
                            Map<String, Object> fieldResult = convertFieldDetailToMap(fieldDetail);
                            fieldJsonList.add((String)fieldResult.get('_jsonString'));
                        }
                    }
                }
                
                String sectionJson = JSON.serialize(sectionName) + ': [' + String.join(fieldJsonList, ', ') + ']';
                sectionJsonParts.add(sectionJson);
            }
            
            fieldsDetailsJson = '{ ' + String.join(sectionJsonParts, ', ') + ' }';
        } else {
            // No sections - put all fields in default section
            List<String> defaultFieldJsonList = new List<String>();
            for (FieldAnalysisDetail fieldDetail : fieldDetailsMap.values()) {
                if (!isLookupFieldType(fieldDetail.fieldType)) {
                    Map<String, Object> fieldResult = convertFieldDetailToMap(fieldDetail);
                    defaultFieldJsonList.add((String)fieldResult.get('_jsonString'));
                }
            }
            fieldsDetailsJson = '{ "General Information": [' + String.join(defaultFieldJsonList, ', ') + '] }';
        }
        
        // Build final JSON with specific property order
        String finalJson = '{' +
            '"objectName": ' + JSON.serialize(objectLabel) + ', ' +
            '"objectApiName": ' + JSON.serialize(objectName) + ', ' +
            '"recordTypeName": ' + JSON.serialize(recordTypeName != null ? recordTypeName : '') + ', ' +
            '"recordTypeId": ' + JSON.serialize(recordTypeId != null ? recordTypeId : '') + ', ' +
            '"fieldsDetails": ' + fieldsDetailsJson +
        '}';
        
        return finalJson;
    }
    
    // Converts field detail to JSON string (manually built to preserve property order)
    private static Map<String, Object> convertFieldDetailToMap(FieldAnalysisDetail field) {
        List<String> properties = new List<String>();
        
        addCoreFieldProperties(properties, field);
        addTypeSpecificProperties(properties, field);
        
        String fieldJson = '{ ' + String.join(properties, ', ') + ' }';
        
        Map<String, Object> result = new Map<String, Object>();
        result.put('_jsonString', fieldJson);
        return result;
    }
    
    // Adds core field properties in specific order
    private static void addCoreFieldProperties(List<String> properties, FieldAnalysisDetail field) {
        properties.add('"fieldName": ' + JSON.serialize(field.fieldName));
        properties.add('"fieldLabel": ' + JSON.serialize(field.fieldLabel));
        properties.add('"fieldType": ' + JSON.serialize(formatDataType(field.fieldType)));
        
        if (field.description != null && String.isNotBlank(field.description)) {
            properties.add('"description": ' + JSON.serialize(field.description));
        }
        
        properties.add('"isRequired": ' + field.isRequired);
        properties.add('"isCreateable": ' + field.isCreateable);
        
        if (field.defaultValue != null && String.isNotBlank(field.defaultValue)) {
            properties.add('"defaultValue": ' + JSON.serialize(field.defaultValue));
        }
    }
    
    // Adds type-specific properties to JSON (maxLength for text, picklist values, etc.)
    private static void addTypeSpecificProperties(List<String> properties, FieldAnalysisDetail field) {
        String fieldType = field.fieldType;
        
        // Text fields show max length
        if (isTextFieldType(fieldType)) {
            if (field.length != null && field.length > 0) {
                properties.add('"maxLength": ' + field.length);
            }
        }
        
        // Picklist fields show available values and dependencies
        else if (isPicklistFieldType(fieldType) && 
                 field.picklistValues != null && !field.picklistValues.isEmpty()) {
            properties.add('"picklistValues": ' + JSON.serialize(field.picklistValues));
            
            if (field.isDependentPicklist != null && field.isDependentPicklist && field.controllingField != null) {
                properties.add('"isDependentPicklist": true');
                properties.add('"controllingField": ' + JSON.serialize(field.controllingField));
            }
        }
    }
    
    private static Boolean isTextFieldType(String fieldType) {
        return fieldType == 'STRING' || fieldType == 'TEXTAREA' || fieldType == 'EMAIL' || 
               fieldType == 'URL' || fieldType == 'PHONE';
    }
    
    private static Boolean isPicklistFieldType(String fieldType) {
        return fieldType == 'PICKLIST' || fieldType == 'MULTIPICKLIST';
    }
    
    private static Boolean isLookupFieldType(String fieldType) {
        return fieldType == 'REFERENCE';
    }
    
    // Fetches field descriptions from FieldDefinition metadata (bulk query for efficiency)
    private static Map<String, String> getFieldDescriptions(String objectName, Set<String> fieldApiNames) {
        Map<String, String> descByField = new Map<String, String>();
        
        try {
            for (FieldDefinition fd : [
                SELECT QualifiedApiName, Description
                FROM FieldDefinition
                WHERE EntityDefinition.QualifiedApiName = :objectName
                  AND QualifiedApiName IN :fieldApiNames
            ]) {
                if (String.isNotBlank(fd.Description)) {
                    descByField.put(fd.QualifiedApiName, fd.Description);
                }
            }
        } catch (Exception e) {
            System.debug('Could not fetch field descriptions: ' + e.getMessage());
        }
        
        return descByField;
    }
    
    // Converts internal field type to user-friendly display name
    private static String formatDataType(String fieldType) {
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
    
    // Adds type-specific attributes to text report
    private static void addTypeSpecificAttributes(List<String> report, FieldAnalysisDetail field) {
        String fieldType = field.fieldType;
        
        // Text fields - show max length
        if (fieldType == 'STRING' || fieldType == 'TEXTAREA' || fieldType == 'EMAIL' || 
            fieldType == 'URL' || fieldType == 'PHONE') {
            if (field.length != null && field.length > 0) {
                report.add('Max Length: ' + field.length);
            }
        }
        
        // Number/Currency fields (no special attributes needed in report)
        else if (fieldType == 'INTEGER' || fieldType == 'DOUBLE' || 
                 fieldType == 'CURRENCY' || fieldType == 'PERCENT') {
        }
        
        // Picklist fields - show values and dependencies
        else if ((fieldType == 'PICKLIST' || fieldType == 'MULTIPICKLIST') && 
                 field.picklistValues != null && !field.picklistValues.isEmpty()) {
            report.add('Values: ' + String.join(field.picklistValues, ', '));
            
            if (field.isDependentPicklist && field.controllingField != null) {
                report.add('Depends On: ' + field.controllingField);
            }
        }
    }
    
    // Checks if field is a system field that should be excluded
    private static Boolean isSystemField(String fieldName) {
        Set<String> systemFields = new Set<String>{
            'Id', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById',
            'SystemModstamp', 'LastActivityDate', 'LastViewedDate', 'LastReferencedDate'
        };
        return systemFields.contains(fieldName);
    }
    
    // Comparator for alphabetical sorting of field options
    public class FieldOptionComparator implements Comparator<FieldOption> {
        public Integer compare(FieldOption field1, FieldOption field2) {
            return field1.label.compareTo(field2.label);
        }
    }
    
    // Comparator for sorting sections by step number
    public class SectionComparator implements Comparator<InstructionData> {
        public Integer compare(InstructionData section1, InstructionData section2) {
            if (section1.stepNumber == null && section2.stepNumber == null) {
                return 0;
            }
            if (section1.stepNumber == null) {
                return 1; // Null values go to end
            }
            if (section2.stepNumber == null) {
                return -1;
            }
            
            if (section1.stepNumber < section2.stepNumber) {
                return -1;
            } else if (section1.stepNumber > section2.stepNumber) {
                return 1;
            } else {
                return 0;
            }
        }
    }
}