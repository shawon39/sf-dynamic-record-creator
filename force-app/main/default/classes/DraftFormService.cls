/**
 * Service class for managing DraftForm__c records
 * Provides shared access - all users can see and edit all draft forms
 */
public with sharing class DraftFormService {
    
    /**
     * Save form data as a draft
     * @param formDataJson JSON string containing form data and metadata
     * @return String - ID of created/updated DraftForm__c record
     */
    @AuraEnabled
    public static String saveDraftForm(String formDataJson) {
        try {
            Map<String, Object> formData = (Map<String, Object>) JSON.deserializeUntyped(formDataJson);
            
            // Extract required fields
            String externalFormId = (String) formData.get('externalFormId');
            String formId = (String) formData.get('formId');
            String sourceRecordId = (String) formData.get('sourceRecordId');
            String formName = (String) formData.get('formName');
            String objectName = (String) formData.get('objectName');
            Integer progress = (Integer) formData.get('progress');
            
            // Validate required fields
            if (String.isBlank(externalFormId) || String.isBlank(formId)) {
                throw new AuraHandledException('External Form ID and Form ID are required');
            }
            
            // Check if draft already exists
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
                draftForm.Status__c = 'Draft'; // Set default status
            }
            
            // Set/update fields
            draftForm.Form_ID__c = formId;
            draftForm.Source_Record_ID__c = sourceRecordId;
            draftForm.Form_Data_JSON__c = formDataJson;
            
            // Ensure status is Draft when saving draft
            if (draftForm.Status__c != 'Created') {
                draftForm.Status__c = 'Draft';
            }
            
            // Generate user-friendly name
            String progressText = progress != null ? progress + '% Complete' : 'In Progress';
            String creatorName = UserInfo.getName();
            draftForm.Name = objectName + ' / ' + formName + ' - ' + progressText + ' (by ' + creatorName + ')';
            
            // Save the record
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
    
    /**
     * Get all draft forms (shared access - optional filtering by Source_Record_ID__c)
     * @param recordId - Optional record ID to filter drafts by Source_Record_ID__c
     * @return List<DraftForm__c> - Draft forms with creator info
     */
    @AuraEnabled(cacheable=false)
    public static List<DraftForm__c> getAllDraftForms(String recordId) {
        try {
            // Build dynamic SOQL query
            String soql = 'SELECT Id, Name, External_Form_ID__c, Form_ID__c, Source_Record_ID__c, ' +
                          'Form_Data_JSON__c, Status__c, Created_Record_ID__c, CreatedBy.Name, CreatedDate, LastModifiedDate ' +
                          'FROM DraftForm__c ';
            
            // Add recordId filter if provided
            if (String.isNotBlank(recordId)) {
                System.debug('DraftFormService.getAllDraftForms: Filtering drafts for recordId: ' + recordId);
                soql += 'WHERE Source_Record_ID__c = :recordId ';
            }
            
            soql += 'ORDER BY LastModifiedDate DESC';
            
            return Database.query(soql);
        } catch (Exception e) {
            System.debug('Error getting draft forms: ' + e.getMessage());
            throw new AuraHandledException('Error retrieving drafts: ' + e.getMessage());
        }
    }
    
    /**
     * Get specific draft by record ID
     * @param draftId - DraftForm__c record ID
     * @return DraftForm__c - Draft form record
     */
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
    
    /**
     * Delete draft form record
     * @param draftId - DraftForm__c record ID to delete
     */
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
                System.debug('Successfully deleted draft: ' + draftId);
            }
            
        } catch (Exception e) {
            System.debug('Error deleting draft form: ' + e.getMessage());
            throw new AuraHandledException('Error deleting draft: ' + e.getMessage());
        }
    }
    
    /**
     * Get draft by External Form ID (for migration/compatibility)
     * @param externalFormId - External Form ID
     * @return DraftForm__c - Draft form record or null
     */
    @AuraEnabled
    public static DraftForm__c getDraftByExternalId(String externalFormId) {
        try {
            if (String.isBlank(externalFormId)) {
                return null;
            }
            
            List<DraftForm__c> drafts = [
                SELECT Id, Name, External_Form_ID__c, Form_ID__c, Source_Record_ID__c, 
                       Form_Data_JSON__c, Status__c, CreatedBy.Name, CreatedDate
                FROM DraftForm__c 
                WHERE External_Form_ID__c = :externalFormId
                LIMIT 1
            ];
            
            return drafts.isEmpty() ? null : drafts[0];
            
        } catch (Exception e) {
            System.debug('Error getting draft by external ID: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * Update draft status from Draft to Created when form is successfully submitted
     * @param draftId - DraftForm__c record ID to update
     * @param createdRecordId - ID of the created record for reference
     */
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
                draftForm.Created_Record_ID__c = createdRecordId; // Store the created record ID
                
                // Optionally update the name to indicate it's been created
                if (draftForm.Name != null) {
                    String currentName = draftForm.Name;
                    // Replace status indicators in the name
                    currentName = currentName.replace('- In Progress', '- Created');
                    currentName = currentName.replace('% Complete', '% - Created');
                    if (!currentName.contains('Created')) {
                        currentName += ' - Created';
                    }
                    draftForm.Name = currentName;
                }
                
                update draftForm;
                System.debug('Successfully updated draft status to Created: ' + draftId);
            } else {
                System.debug('Draft not found for status update: ' + draftId);
            }
            
        } catch (Exception e) {
            System.debug('Error updating draft status: ' + e.getMessage());
            throw new AuraHandledException('Error updating draft status: ' + e.getMessage());
        }
    }
}
