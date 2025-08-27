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
            
            // Get field descriptions in one query for O(1) lookup
            Set<String> fieldApiNames = new Set<String>(selectedFields);
            Map<String, String> fieldDescriptions = getFieldDescriptions(objectName, fieldApiNames);
            
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
                    detail.description = fieldDescriptions.get(fieldName); // O(1) lookup
                    detail.isRequired = !fieldDescribe.isNillable() && !fieldDescribe.isDefaultedOnCreate();
                    detail.length = fieldDescribe.getLength();
                    detail.isCreateable = fieldDescribe.isCreateable();
                    detail.defaultValue = fieldDescribe.getDefaultValue() != null ? String.valueOf(fieldDescribe.getDefaultValue()) : null;
                    
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
            
        } catch (Exception e) {
            Console.log('Error in FieldService.analyzeFieldsAndGenerateReport: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to analyze fields: ' + e.getMessage());
        }
        
        return result;
    }
    
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
            
            // Get field descriptions in one query for O(1) lookup
            Set<String> fieldApiNames = new Set<String>(selectedFields);
            Map<String, String> fieldDescriptions = getFieldDescriptions(objectName, fieldApiNames);
            
            // Create map of field details for easy lookup
            Map<String, FieldAnalysisDetail> fieldDetailsMap = new Map<String, FieldAnalysisDetail>();
            
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
                    detail.description = fieldDescriptions.get(fieldName); // O(1) lookup
                    detail.isRequired = !fieldDescribe.isNillable() && !fieldDescribe.isDefaultedOnCreate();
                    detail.length = fieldDescribe.getLength();
                    detail.isCreateable = fieldDescribe.isCreateable();
                    detail.defaultValue = fieldDescribe.getDefaultValue() != null ? String.valueOf(fieldDescribe.getDefaultValue()) : null;
                    
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
                    
                    fieldDetailsMap.put(detail.fieldName, detail);
                    result.fieldDetails.add(detail);
                }
            }
            
            // Generate JSON analysis report with sections
            result.analysisReport = generateJSONAnalysisReport(objectName, recordTypeName, recordTypeId, 
                                                             fieldDetailsMap, sections);
            
        } catch (Exception e) {
            Console.log('Error in FieldService.analyzeFieldsAndGenerateJSONReport: ' + e.getMessage());
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
            if (!field.isCreateable) {
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
    
    private static String generateJSONAnalysisReport(String objectName, String recordTypeName, String recordTypeId,
                                                   Map<String, FieldAnalysisDetail> fieldDetailsMap, List<InstructionData> sections) {
        
        // Get object label
        Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectName);
        String objectLabel = objectType != null ? objectType.getDescribe().getLabel() : objectName;
        
        // Build the JSON structure with specific order
        Map<String, Object> jsonData = new Map<String, Object>();
        // Add properties in the exact order requested
        jsonData.put('objectName', objectLabel);
        jsonData.put('objectApiName', objectName);
        jsonData.put('recordTypeName', recordTypeName);
        jsonData.put('recordTypeId', recordTypeId);
        
        // Create fieldsDetails structure organized by sections (preserving order)
        String fieldsDetailsJson = '';
        
        if (sections != null && !sections.isEmpty()) {
            // Sort sections by step number to maintain order
            List<InstructionData> sortedSections = new List<InstructionData>(sections);
            sortedSections.sort(new SectionComparator());
            
            // Build fieldsDetails JSON manually to preserve order
            List<String> sectionJsonParts = new List<String>();
            
            // Process sections and their fields in order
            for (InstructionData section : sortedSections) {
                String sectionName = section.text != null ? section.text : 'Unnamed Section';
                List<String> fieldJsonList = new List<String>();
                
                if (section.fields != null && !section.fields.isEmpty()) {
                    for (String fieldName : section.fields) {
                        FieldAnalysisDetail fieldDetail = fieldDetailsMap.get(fieldName);
                        if (fieldDetail != null) {
                            Map<String, Object> fieldResult = convertFieldDetailToMap(fieldDetail);
                            fieldJsonList.add((String)fieldResult.get('_jsonString'));
                        }
                    }
                }
                
                // Build section JSON part (properly escape section name)
                String sectionJson = JSON.serialize(sectionName) + ': [' + String.join(fieldJsonList, ', ') + ']';
                sectionJsonParts.add(sectionJson);
            }
            
            fieldsDetailsJson = '{ ' + String.join(sectionJsonParts, ', ') + ' }';
        } else {
            // If no sections provided, create a default section with all fields
            List<String> defaultFieldJsonList = new List<String>();
            for (FieldAnalysisDetail fieldDetail : fieldDetailsMap.values()) {
                Map<String, Object> fieldResult = convertFieldDetailToMap(fieldDetail);
                defaultFieldJsonList.add((String)fieldResult.get('_jsonString'));
            }
            fieldsDetailsJson = '{ "General Information": [' + String.join(defaultFieldJsonList, ', ') + '] }';
        }
        
        // Build final JSON manually to preserve top-level order
        String finalJson = '{' +
            '"objectName": ' + JSON.serialize(objectLabel) + ', ' +
            '"objectApiName": ' + JSON.serialize(objectName) + ', ' +
            '"recordTypeName": ' + JSON.serialize(recordTypeName != null ? recordTypeName : '') + ', ' +
            '"recordTypeId": ' + JSON.serialize(recordTypeId != null ? recordTypeId : '') + ', ' +
            '"fieldsDetails": ' + fieldsDetailsJson +
        '}';
        
        return finalJson;
    }
    
    private static Map<String, Object> convertFieldDetailToMap(FieldAnalysisDetail field) {
        // Build field JSON manually to guarantee property order
        List<String> properties = new List<String>();
        
        // Add core properties (always first)
        addCoreFieldProperties(properties, field);
        
        // Add type-specific properties
        addTypeSpecificProperties(properties, field);
        
        // Build the final field JSON object
        String fieldJson = '{ ' + String.join(properties, ', ') + ' }';
        
        // Return as a Map for compatibility, but we'll actually use the JSON string
        Map<String, Object> result = new Map<String, Object>();
        result.put('_jsonString', fieldJson);
        return result;
    }
    
    private static void addCoreFieldProperties(List<String> properties, FieldAnalysisDetail field) {
        // ALWAYS put these three fields first in this exact order
        properties.add('"fieldName": ' + JSON.serialize(field.fieldName));
        properties.add('"fieldLabel": ' + JSON.serialize(field.fieldLabel));
        properties.add('"fieldType": ' + JSON.serialize(formatDataType(field.fieldType)));
        
        // Add description right after fieldType
        if (field.description != null && String.isNotBlank(field.description)) {
            properties.add('"description": ' + JSON.serialize(field.description));
        }
        
        // Then add other basic properties
        properties.add('"isRequired": ' + field.isRequired);
        properties.add('"isCreateable": ' + field.isCreateable);
        
        // Add default value if present
        if (field.defaultValue != null && String.isNotBlank(field.defaultValue)) {
            properties.add('"defaultValue": ' + JSON.serialize(field.defaultValue));
        }
    }
    
    private static void addTypeSpecificProperties(List<String> properties, FieldAnalysisDetail field) {
        String fieldType = field.fieldType;
        
        // Text fields - show length limit
        if (isTextFieldType(fieldType)) {
            if (field.length != null && field.length > 0) {
                properties.add('"maxLength": ' + field.length);
            }
        }
        
        // Picklist fields - show available values
        else if (isPicklistFieldType(fieldType) && 
                 field.picklistValues != null && !field.picklistValues.isEmpty()) {
            properties.add('"picklistValues": ' + JSON.serialize(field.picklistValues));
            
            // Show if it's dependent on another field
            if (field.isDependentPicklist != null && field.isDependentPicklist && field.controllingField != null) {
                properties.add('"isDependentPicklist": true');
                properties.add('"controllingField": ' + JSON.serialize(field.controllingField));
            }
        }
        
        // Lookup fields - show referenced object
        else if (fieldType == 'REFERENCE' && field.referenceTo != null) {
            properties.add('"referenceTo": ' + JSON.serialize(field.referenceTo));
        }
    }
    
    private static Boolean isTextFieldType(String fieldType) {
        return fieldType == 'STRING' || fieldType == 'TEXTAREA' || fieldType == 'EMAIL' || 
               fieldType == 'URL' || fieldType == 'PHONE';
    }
    
    private static Boolean isPicklistFieldType(String fieldType) {
        return fieldType == 'PICKLIST' || fieldType == 'MULTIPICKLIST';
    }
    
    private static Map<String, String> getFieldDescriptions(String objectName, Set<String> fieldApiNames) {
        Map<String, String> descByField = new Map<String, String>();
        
        try {
            // Query FieldDefinition for field descriptions with O(1) lookup
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
            Console.log('Warning: Could not fetch field descriptions - ' + e.getMessage());
        }
        
        return descByField;
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
        
        // Number/Currency fields
        else if (fieldType == 'INTEGER' || fieldType == 'DOUBLE' || 
                 fieldType == 'CURRENCY' || fieldType == 'PERCENT') {
            // Basic number field info without precision/scale details
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
        // No special field properties shown for simplification
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
    
    // Comparator to sort sections by step number
    public class SectionComparator implements Comparator<InstructionData> {
        public Integer compare(InstructionData section1, InstructionData section2) {
            if (section1.stepNumber == null && section2.stepNumber == null) {
                return 0;
            }
            if (section1.stepNumber == null) {
                return 1; // null values go to end
            }
            if (section2.stepNumber == null) {
                return -1; // null values go to end
            }
            
            // Compare Integer values
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