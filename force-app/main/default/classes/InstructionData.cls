public class InstructionData {
    @AuraEnabled public Integer stepNumber { get; set; }
    @AuraEnabled public String text { get; set; }
    @AuraEnabled public List<String> fields { get; set; }
    
    public InstructionData() {
        this.fields = new List<String>();
    }
}