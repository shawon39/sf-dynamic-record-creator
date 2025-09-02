import { LightningElement } from 'lwc';

export default class FormDashboard extends LightningElement {
    forms = [
        { id: 1, objectName: 'Object name', formName: 'Form name Form name Form name Form name Form name', progress: 52 },
        { id: 2, objectName: 'Object name', formName: 'Form name', progress: 52 },
        { id: 3, objectName: 'Object name', formName: 'Form name', progress: 52 },
        { id: 4, objectName: 'Object name', formName: 'Form name', progress: 100 },
    ];

    get formList() {
        return this.forms.map(form => ({
            ...form,
            isCompleted: form.progress === 100,
            progressText: form.progress === 100 ? 'Completed' : `${form.progress}% Complete`,
            progressTextClass: form.progress === 100 
                ? 'slds-text-body_small slds-text-color_success' 
                : 'slds-text-body_small slds-text-color_weak',
            label: `${form.objectName} / ${form.formName}`,
        }));
    }
}
