public with sharing class DraftFormService {
    
    // Saves or updates a draft form with user-entered data
    @AuraEnabled
    public static String saveDraftForm(String formDataJson) {
        try {
            Map<String, Object> formData = (Map<String, Object>) JSON.deserializeUntyped(formDataJson);
            
            String externalFormId = (String) formData.get('externalFormId');
            String formId = (String) formData.get('formId');
            String sourceRecordId = (String) formData.get('sourceRecordId');
            String formName = (String) formData.get('formName');
            String objectName = (String) formData.get('objectName');
            Integer progress = (Integer) formData.get('progress');
            
            if (String.isBlank(externalFormId) || String.isBlank(formId)) {
                throw new AuraHandledException('External Form ID and Form ID are required');
            }
            
            // Check if draft already exists for this external form ID
            List<DraftForm__c> existingDrafts = [
                SELECT Id, Name, External_Form_ID__c, Form_ID__c, Source_Record_ID__c, Form_Data_JSON__c, Status__c
                FROM DraftForm__c 
                WHERE External_Form_ID__c = :externalFormId
                LIMIT 1
            ];
            
            DraftForm__c draftForm;
            
            if (!existingDrafts.isEmpty()) {
                // Update existing draft
                draftForm = existingDrafts[0];
            } else {
                // Create new draft
                draftForm = new DraftForm__c();
                draftForm.External_Form_ID__c = externalFormId;
                draftForm.Status__c = 'Draft';
            }
            
            draftForm.Form_ID__c = formId;
            draftForm.Source_Record_ID__c = sourceRecordId;
            draftForm.Form_Data_JSON__c = formDataJson;
            
            // Keep status as Draft unless already Created
            if (draftForm.Status__c != 'Created') {
                draftForm.Status__c = 'Draft';
            }
            
            // Generate user-friendly name with progress
            String progressText = progress != null ? progress + '% Complete' : 'In Progress';
            String creatorName = UserInfo.getName();
            draftForm.Name = objectName + ' / ' + formName + ' - ' + progressText + ' (by ' + creatorName + ')';
            
            if (draftForm.Id != null) {
                update draftForm;
            } else {
                insert draftForm;
            }
            
            return draftForm.Id;
            
        } catch (Exception e) {
            System.debug('Error saving draft form: ' + e.getMessage());
            throw new AuraHandledException('Error saving draft: ' + e.getMessage());
        }
    }
    
    // Retrieves all draft forms, optionally filtered by source record ID
    @AuraEnabled(cacheable=false)
    public static List<DraftForm__c> getAllDraftForms(String recordId) {
        try {
            String soql = 'SELECT Id, Name, External_Form_ID__c, Form_ID__c, Source_Record_ID__c, ' +
                          'Form_Data_JSON__c, Status__c, Created_Record_ID__c, CreatedBy.Name, CreatedDate, LastModifiedDate ' +
                          'FROM DraftForm__c ';
            
            // Filter by source record if provided
            if (String.isNotBlank(recordId)) {
                soql += 'WHERE Source_Record_ID__c = :recordId ';
            }
            
            soql += 'ORDER BY LastModifiedDate DESC';
            
            return Database.query(soql);
        } catch (Exception e) {
            System.debug('Error getting draft forms: ' + e.getMessage());
            throw new AuraHandledException('Error retrieving drafts: ' + e.getMessage());
        }
    }
    
    // Retrieves a specific draft form by its record ID
    @AuraEnabled
    public static DraftForm__c getDraftById(String draftId) {
        try {
            if (String.isBlank(draftId)) {
                throw new AuraHandledException('Draft ID is required');
            }
            
            List<DraftForm__c> drafts = [
                SELECT Id, Name, External_Form_ID__c, Form_ID__c, Source_Record_ID__c, 
                       Form_Data_JSON__c, Status__c, Created_Record_ID__c, CreatedBy.Name, CreatedDate
                FROM DraftForm__c 
                WHERE Id = :draftId
                LIMIT 1
            ];
            
            if (drafts.isEmpty()) {
                throw new AuraHandledException('Draft not found');
            }
            
            return drafts[0];
            
        } catch (Exception e) {
            System.debug('Error getting draft by ID: ' + e.getMessage());
            throw new AuraHandledException('Error retrieving draft: ' + e.getMessage());
        }
    }
    
    // Deletes a draft form permanently
    @AuraEnabled
    public static void deleteDraftForm(String draftId) {
        try {
            if (String.isBlank(draftId)) {
                throw new AuraHandledException('Draft ID is required');
            }
            
            List<DraftForm__c> draftsToDelete = [
                SELECT Id 
                FROM DraftForm__c 
                WHERE Id = :draftId
                LIMIT 1
            ];
            
            if (!draftsToDelete.isEmpty()) {
                delete draftsToDelete;
            }
            
        } catch (Exception e) {
            throw new AuraHandledException('Error deleting draft: ' + e.getMessage());
        }
    }
    
    // Updates draft status from Draft to Created when form is successfully submitted
    @AuraEnabled
    public static void updateDraftStatus(String draftId, String createdRecordId) {
        try {
            if (String.isBlank(draftId)) {
                throw new AuraHandledException('Draft ID is required');
            }
            
            List<DraftForm__c> draftsToUpdate = [
                SELECT Id, Name, Status__c, Created_Record_ID__c 
                FROM DraftForm__c 
                WHERE Id = :draftId
                LIMIT 1
            ];
            
            if (!draftsToUpdate.isEmpty()) {
                DraftForm__c draftForm = draftsToUpdate[0];
                draftForm.Status__c = 'Created';
                draftForm.Created_Record_ID__c = createdRecordId;
                
                // Update name to reflect created status
                if (draftForm.Name != null) {
                    String currentName = draftForm.Name;
                    currentName = currentName.replace('- In Progress', '- Created');
                    currentName = currentName.replace('% Complete', '% - Created');
                    if (!currentName.contains('Created')) {
                        currentName += ' - Created';
                    }
                    draftForm.Name = currentName;
                }
                
                update draftForm;
            }
            
        } catch (Exception e) {
            throw new AuraHandledException('Error updating draft status: ' + e.getMessage());
        }
    }
}