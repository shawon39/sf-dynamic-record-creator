import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getForms from '@salesforce/apex/FormSelectorController.getForms';

export default class DynamicFormSelector extends NavigationMixin(LightningElement) {
    @track forms = [];
    @track isLoading = true;

    @wire(getForms)
    wiredForms({ data, error }) {
        this.isLoading = false;
        if (data) {
            this.forms = data;
        } else if (error) {
            // eslint-disable-next-line no-console
            console.error('Error loading forms', error);
            this.forms = [];
        }
    }

    get hasForms() {
        return this.forms && this.forms.length > 0;
    }

    handleTileKeydown(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleNavigate(event);
        }
    }

    handleNavigate(event) {
        const formId = event.currentTarget?.dataset?.id;
        if (!formId) return;
        
        this[NavigationMixin.Navigate]({
            type: 'standard__navItemPage',
            attributes: {
                apiName: 'Dynamic_Record_Creator'
            },
            state: {
                c__formId: formId
            }
        });
    }
}
