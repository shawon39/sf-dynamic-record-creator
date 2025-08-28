public with sharing class InstructionManagerService {
    
    public class InstructionData {
        @AuraEnabled public String objectName;
        @AuraEnabled public List<String> availableFields;
        @AuraEnabled public List<InstructionStep> instructions;
        
        public InstructionData() {
            this.availableFields = new List<String>();
            this.instructions = new List<InstructionStep>();
        }
    }
    
    public class InstructionStep {
        @AuraEnabled public String id;
        @AuraEnabled public Integer stepNumber;
        @AuraEnabled public String text;
        @AuraEnabled public List<String> fields;
        
        public InstructionStep() {
            this.fields = new List<String>();
        }
        
        public InstructionStep(String id, Integer stepNumber, String text, List<String> fields) {
            this.id = id;
            this.stepNumber = stepNumber;
            this.text = text;
            this.fields = fields != null ? fields : new List<String>();
        }
    }
    
    @AuraEnabled(cacheable=true)
    public static InstructionData getInstructionsForAnalysis(String analysisId) {
        InstructionData result = new InstructionData();
        
        try {
            Console.log('InstructionManagerService.getInstructionsForAnalysis: Starting for analysisId: ' + analysisId);
            
            if (String.isBlank(analysisId)) {
                throw new IllegalArgumentException('Analysis ID cannot be blank');
            }
            
            // Check permissions
            if (!Schema.sObjectType.Dynamic_Field_Analysis__c.isAccessible()) {
                throw new AuraHandledException('No access to Dynamic Field Analysis records');
            }
            
            // Get the field analysis record
            List<Dynamic_Field_Analysis__c> analysisRecords = [
                SELECT Id, Object_Name__c, Selected_Fields__c
                FROM Dynamic_Field_Analysis__c 
                WHERE Id = :analysisId 
                LIMIT 1
            ];
            
            if (analysisRecords.isEmpty()) {
                throw new AuraHandledException('Field analysis record not found');
            }
            
            Dynamic_Field_Analysis__c analysis = analysisRecords[0];
            result.objectName = analysis.Object_Name__c;
            
            // Parse available fields
            if (String.isNotBlank(analysis.Selected_Fields__c)) {
                String[] fieldArray = analysis.Selected_Fields__c.split(',');
                for (String field : fieldArray) {
                    String fieldName = field.trim();
                    if (String.isNotBlank(fieldName)) {
                        result.availableFields.add(fieldName);
                    }
                }
            }
            
            Console.log('Found ' + result.availableFields.size() + ' available fields');
            
            // Get existing instructions
            if (Schema.sObjectType.Dynamic_Field_Instructions__c.isAccessible()) {
                List<Dynamic_Field_Instructions__c> instructionRecords = [
                    SELECT Id, Step_Number__c, Name, Related_Fields__c
                    FROM Dynamic_Field_Instructions__c
                    WHERE Field_Analysis__c = :analysisId
                    AND Is_Active__c = true
                    ORDER BY Step_Number__c ASC
                ];
                
                Console.log('Found ' + instructionRecords.size() + ' instruction records');
                
                for (Dynamic_Field_Instructions__c record : instructionRecords) {
                    List<String> stepFields = new List<String>();
                    
                    // Parse related fields
                    if (String.isNotBlank(record.Related_Fields__c)) {
                        String[] relatedFieldArray = record.Related_Fields__c.split(',');
                        for (String field : relatedFieldArray) {
                            String fieldName = field.trim();
                            if (String.isNotBlank(fieldName)) {
                                stepFields.add(fieldName);
                            }
                        }
                    }
                    
                    result.instructions.add(new InstructionStep(
                        record.Id,
                        Integer.valueOf(record.Step_Number__c),
                        record.Name,
                        stepFields
                    ));
                }
            }
            
            Console.log('Returning InstructionData with ' + result.instructions.size() + ' instructions');
            
        } catch (Exception e) {
            Console.log('Error in getInstructionsForAnalysis: ' + e.getMessage());
            Console.log('Error stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to retrieve instructions: ' + e.getMessage());
        }
        
        return result;
    }
    
    @AuraEnabled
    public static String createInstructions(String analysisId, List<InstructionStep> instructions) {
        try {
            Console.log('InstructionManagerService.createInstructions: Starting for analysisId: ' + analysisId);
            Console.log('Instructions received: ' + (instructions != null ? instructions.size() : 0));
            
            if (String.isBlank(analysisId)) {
                throw new IllegalArgumentException('Analysis ID cannot be blank');
            }
            
            if (instructions == null || instructions.isEmpty()) {
                return 'No instructions to create';
            }
            
            // Check permissions
            if (!Schema.sObjectType.Dynamic_Field_Instructions__c.isCreateable()) {
                throw new AuraHandledException('No permission to create instruction records');
            }
            
            List<Dynamic_Field_Instructions__c> recordsToInsert = new List<Dynamic_Field_Instructions__c>();
            
            for (InstructionStep instruction : instructions) {
                // Validate instruction data
                if (String.isBlank(instruction.text) || instruction.stepNumber == null || instruction.stepNumber <= 0) {
                    Console.log('Skipping invalid instruction: ' + JSON.serialize(instruction));
                    continue;
                }
                
                Dynamic_Field_Instructions__c record = new Dynamic_Field_Instructions__c();
                record.Field_Analysis__c = analysisId;
                record.Step_Number__c = instruction.stepNumber;
                record.Name = instruction.text.trim();
                record.Is_Active__c = true;
                
                // Set related fields
                if (instruction.fields != null && !instruction.fields.isEmpty()) {
                    record.Related_Fields__c = String.join(instruction.fields, ', ');
                } else {
                    record.Related_Fields__c = '';
                }
                
                recordsToInsert.add(record);
            }
            
            if (!recordsToInsert.isEmpty()) {
                insert recordsToInsert;
                Console.log('Successfully created ' + recordsToInsert.size() + ' instruction records');
                return 'Successfully created ' + recordsToInsert.size() + ' instruction records';
            } else {
                return 'No valid instructions to create';
            }
            
        } catch (Exception e) {
            Console.log('Error in InstructionManagerService.createInstructions: ' + e.getMessage());
            throw new AuraHandledException('Failed to create instructions: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static String deleteInstruction(String instructionId) {
        try {
            Console.log('InstructionManagerService.deleteInstruction: Starting for instructionId: ' + instructionId);
            
            if (String.isBlank(instructionId)) {
                throw new IllegalArgumentException('Instruction ID cannot be blank');
            }
            
            // Check permissions
            if (!Schema.sObjectType.Dynamic_Field_Instructions__c.isDeletable()) {
                throw new AuraHandledException('No permission to delete instruction records');
            }
            
            List<Dynamic_Field_Instructions__c> recordsToDelete = [
                SELECT Id FROM Dynamic_Field_Instructions__c 
                WHERE Id = :instructionId 
                LIMIT 1
            ];
            
            if (!recordsToDelete.isEmpty()) {
                delete recordsToDelete;
                Console.log('Successfully deleted instruction record');
                return 'Instruction deleted successfully';
            } else {
                throw new AuraHandledException('Instruction record not found');
            }
            
        } catch (Exception e) {
            Console.log('Error in InstructionManagerService.deleteInstruction: ' + e.getMessage());
            throw new AuraHandledException('Failed to delete instruction: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static String updateInstruction(String instructionId, String instructionText, List<String> relatedFields) {
        try {
            Console.log('InstructionManagerService.updateInstruction: Starting for instructionId: ' + instructionId);
            
            if (String.isBlank(instructionId)) {
                throw new IllegalArgumentException('Instruction ID cannot be blank');
            }
            
            if (String.isBlank(instructionText)) {
                throw new IllegalArgumentException('Instruction text cannot be blank');
            }
            
            // Check permissions
            if (!Schema.sObjectType.Dynamic_Field_Instructions__c.isUpdateable()) {
                throw new AuraHandledException('No permission to update instruction records');
            }
            
            List<Dynamic_Field_Instructions__c> recordsToUpdate = [
                SELECT Id, Name, Related_Fields__c
                FROM Dynamic_Field_Instructions__c 
                WHERE Id = :instructionId 
                LIMIT 1
            ];
            
            if (!recordsToUpdate.isEmpty()) {
                Dynamic_Field_Instructions__c record = recordsToUpdate[0];
                record.Name = instructionText.trim();
                
                if (relatedFields != null && !relatedFields.isEmpty()) {
                    record.Related_Fields__c = String.join(relatedFields, ', ');
                } else {
                    record.Related_Fields__c = '';
                }
                
                update record;
                Console.log('Successfully updated instruction record');
                return 'Instruction updated successfully';
            } else {
                throw new AuraHandledException('Instruction record not found');
            }
            
        } catch (Exception e) {
            Console.log('Error in InstructionManagerService.updateInstruction: ' + e.getMessage());
            throw new AuraHandledException('Failed to update instruction: ' + e.getMessage());
        }
    }
}