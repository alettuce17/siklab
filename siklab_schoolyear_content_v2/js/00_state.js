/* =========================================================
 * SIKLAB SHARED STATE
 * ========================================================= */

let students = [];
let schoolYears = [];
var currentSchoolYearId = null;
var currentSchoolYearLabel = '';

let currentGroupSetId = 'A';
let currentGroupSetName = 'Set A';
let availableGroupSets = [{ id: 'A', name: 'Set A' }];
let storedGroups = [];

let currentMatchType = 'individual';
let matchHistory = [];
let allGames = [];

let activeSelectionTarget = null;
let selectedP1 = null;
let selectedP2 = null;
let currentlyEditingGroup = null;

window.siklabControllerLastSeen = {
    player1: 0,
    player2: 0
};

window.siklabControllerDevices = {
    player1: null,
    player2: null
};
