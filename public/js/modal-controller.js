var scheduleMeApp = angular.module('ScheduleMeApp');

/*
 * Controller for class and group modals. This logic is a part of the workspace,
 * but has been seperated into a sub-controller, so to speak, to better organize
 * the code.
 */
scheduleMeApp.controller('ModalController', ['$rootScope', '$scope', 'LocalStorage',
    'SectionHttpService', function($rootScope, $scope, localStorage,
    sectionHttpService) {

    // When the user selects a major (or "department"), filter the classes shown
    // by the selected major. For example, if CPSC is selected from the list of majors,
    // only show classes whose department is CPSC.
    $scope.filterClassesByDept = function() {
        $scope.modalData.filteredClasses = [];
        $scope.modalData.filteredSections = [];
        $scope.modalData.selectedClass = null;
        var filteredClasses = [];
        for (var i = 0; i < $scope.allClasses.length; i++) {
            var _class = $scope.allClasses[i];
            if (_class['department'] === $scope.modalData.selectedDept) {
                filteredClasses.push(_class);
            }
        }
        $scope.modalData.filteredClasses = filteredClasses;
    };

    // When the user selects a class, only show sections that belong to the user-selected
    // class.
    $scope.filterSectionsByClass = function() {
        $scope.modalData.filteredSections = [];
        if (!$scope.modalData.selectedClass) {
            return;
        }
        var classID = $scope.modalData.selectedClass.model.class_id;
        sectionHttpService.getSectionsForClass(classID, false).then(function(sections) {
            $scope.modalData.filteredSections = sections;
        });
        sectionHttpService.getSectionsForClass(classID, true).then(function(labSections) {
            $scope.modalData.filteredLabSections = labSections;
        });
    };

    // This method is invoked when a user clicks on "Add Class" 
    // from within the modal.
    $scope.selectClass = function() {
        var allSelectedClasses = localStorage.get('selectedClasses');
        var _class = $scope.modalData.selectedClass;
        if (!allSelectedClasses) {
            allSelectedClasses = [];
        }
        if (_class.course) {
            allSelectedClasses.push(_class.course);
        }
        if (_class.lab) {
            allSelectedClasses.push(_class.lab);
        }

        localStorage.set('selectedClasses', allSelectedClasses);
        $scope.resetModal();
    };

    // This method is invoked when a user clicks on "Add Group"
    // from within the modal. 
    $scope.selectGroup = function() {
        var allSelectedGroups = localStorage.get('selectedGroups');
        var allSelectedClasses = localStorage.get('selectedClasses');
        var selectedGroup = $scope.modalData.groupClasses;
        if (selectedGroup.length === 1) {
            $scope.modalData.selectedClass = $scope.modalData.groupClasses[0];
            return $scope.selectClass();
        }
        if (!allSelectedGroups) {
            allSelectedGroups = [];
        }
        if (allSelectedGroups.indexOf(selectedGroup) === -1) {
            allSelectedGroups.push(selectedGroup);
            localStorage.set('selectedGroups', allSelectedGroups);
        }
        $scope.resetModal();
    };

    $scope.updateSelectedSection = function(type) {
        var allSelectedClasses = localStorage.get('selectedClasses'),
            _class = angular.copy($scope.modalData.selectedClass),
            section = null,
            alreadyExists = false;
        if (type === 'class') {
            section = $scope.modalData.selectedSection;
            alreadyExists = isClassInList(_class, allSelectedClasses);
            if (alreadyExists == false) {
                _class.course = combineClassWithSection(_class.model, section);
            } else {
                _class.course = null;
            }
            $scope.modalData.selectedClass.course = _class.course;
        } else if (type == 'lab') {
            section = $scope.modalData.selectedLabSection;
            alreadyExists = isClassInList(_class, allSelectedClasses);
            // Prevent redundant classes from being added to the list of 
            // selected classes.
            if (alreadyExists == false) {
                _class.lab = combineClassWithSection(_class.model, section);
                _class.lab['isLab'] = true;
            } else {
                _class.lab = null;
            }
            $scope.modalData.selectedClass.lab = _class.lab;
        }
    };

    $scope.updateSelectedGroupSections = function() {
        var allSelectedClasses = localStorage.get('selectedClasses');
        var _class = angular.copy($scope.modalData.selectedClass);
        var section = $scope.modalData.selectedSection;
        var alreadyExists = isClassInList(_class, $scope.modalData.groupClasses) ||
            isClassInList(_class, allSelectedClasses);
        if (alreadyExists === false) {
            _class.course = combineClassWithSection(_class.model, section);
            $scope.modalData.groupClasses.push(_class.course);
        }
        $scope.modalData.selectedDept = null;
        $scope.modalData.selectedClass = {
            model: null,
            course: null,
            lab: null
        };
        $scope.modalData.filteredClasses = [];
        $scope.modalData.filteredSections = [];
        $scope.modalData.selectedSection = null;
        sectionType = '';
        $scope.modalData.groupMessage = 'Repeat the previous steps for all the ' +
            'classes that you want grouped together by degree requirement.';
    };

    $scope.removeSelectedGroupOption = function(_class) {
        var index = $scope.modalData.groupClasses.indexOf(_class);
        $scope.modalData.groupClasses.splice(index, 1);
    };

    // Invoked whenever a user effectively closes a modal.
    $scope.resetModal = function() {
        $scope.modalData = {
            selectedDept: null,
            selectedClass: {
                model: null,
                course: null,
                lab: null
            },
            filteredClasses: [],
            filteredSections: [],
            filteredLabSections: [],
            selectedSection: null,
            selectedLabSection: null,
            sectionType: null,
            labSectionType: '',
            groupClasses: [],
            groupMessage: "Select a department and class. If you don't mind what " + 
                "section you're put in, select 'Any' for the section. If the " +
                "class you've chosen has any available sections and you want to " +
                "be in a specific section, select 'Specific' and then pick " +
                "your section from the list that appears."
        };
    };

    $scope.resetModal();

    $scope.$watch(function() {
        return localStorage.get('allClasses');
    }, function(newValue, oldValue) {
        $scope.allClasses = newValue;
    }, true);

    $scope.$watch(function() {
        return localStorage.get('allDepartments');
    }, function(newValue, oldValue) {
        $scope.allDepartments = newValue;
    }, true);
}]);

// Helper functions
function isClassInList(_class, list) {
    for (var i = 0; _class && list && i < list.length; i++) {
        if (list[i]['class_id'] === _class['class_id']) {
            return true;
        }
    }
    return false;
};

function indexOfClass(_class, list) {
    for (var i = 0; list && i < list.length; i++) {
        if (list[i]['class_id'] === _class['class_id']) {
            return i;
        }
    }
    return -1;
};

function combineClassWithSection(_class, section) {
    if (_class) {
        if (section) {
            _class['crn'] = section['crn'];
        } else {
            _class['crn'] = 'Any';
        }
    }
    return _class;
}