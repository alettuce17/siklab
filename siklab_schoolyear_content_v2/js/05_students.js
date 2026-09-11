/* =========================================================
 * STUDENT MANAGEMENT - SUPABASE
 * Table expected: student
 * ========================================================= */

async function fetchStudentsFromDB() {
    if (!window.currentSchoolYearId) {
        students = [];
        updateStudentList();
        return;
    }

    try {
        const db = requireSupabase();

        const { data, error } = await db
            .from('student')
            .select(
                'student_id,lrn,first_name,last_name,section,school_year_id'
            )
            .eq(
                'school_year_id',
                window.currentSchoolYearId
            )
            .order(
                'last_name',
                { ascending: true }
            )
            .order(
                'first_name',
                { ascending: true }
            );

        if (error) throw error;

        students = (data || []).map(row => ({
            id: row.student_id,
            lrn: row.lrn,
            first: row.first_name,
            last: row.last_name,
            section: row.section,
            year_id: row.school_year_id
        }));

    } catch (error) {
        console.error('[students]', error);

        students = [];

        showErrorToast(
            error.message ||
            'Could not load students.'
        );
    }

    await fetchGroupsFromDB();

    updateStudentList();
}


/* =========================================================
 * RENDER STUDENT LIST
 * ========================================================= */

function updateStudentList() {
    const container =
        document.getElementById(
            'student-list-container'
        );

    const stat =
        document.getElementById(
            'stat-students'
        );

    const count =
        document.getElementById(
            'roster-count'
        );


    if (stat) {
        stat.innerText = students.length;
    }


    if (count) {
        count.innerText =
            `${students.length} Students`;
    }


    if (!container) return;


    if (students.length === 0) {

        const yearLabel =
            window.currentSchoolYearLabel
                ? siklabSafe(
                    window.currentSchoolYearLabel
                )
                : 'the selected school year';


        container.innerHTML = `
            <div class="text-center text-slate-400 mt-10">

                <i
                    class="
                        fa-solid
                        fa-users-slash
                        text-4xl
                        mb-2
                    "
                ></i>

                <p>
                    No students enrolled yet for
                    ${yearLabel}.
                </p>

            </div>
        `;

        return;
    }


    container.innerHTML =
        students.map((s, i) => `

            <div
                class="
                    flex
                    justify-between
                    items-center
                    p-4
                    bg-white
                    border
                    border-slate-100
                    rounded-xl
                    mb-3
                    shadow-sm
                    hover:shadow-md
                    hover:border-orange-200
                    transition-all
                    group
                "
            >

                <div class="flex items-center gap-4">

                    <div
                        class="
                            w-10
                            h-10
                            rounded-full
                            bg-orange-100
                            text-orange-600
                            flex
                            items-center
                            justify-center
                            font-black
                        "
                    >
                        ${i + 1}
                    </div>


                    <div>

                        <p
                            class="
                                font-bold
                                text-slate-800
                            "
                        >
                            ${siklabSafe(s.first)}
                            ${siklabSafe(s.last)}
                        </p>


                        <p
                            class="
                                text-xs
                                text-slate-400
                            "
                        >
                            LRN:
                            ${siklabSafe(
                                s.lrn || 'N/A'
                            )}

                            |

                            Sec:
                            ${siklabSafe(
                                s.section || 'Matapat'
                            )}
                        </p>

                    </div>

                </div>


                <div
                    class="
                        flex
                        gap-2
                        opacity-0
                        group-hover:opacity-100
                        transition-opacity
                    "
                >

                    <button
                        onclick="
                            editStudent(
                                '${Number(s.id)}'
                            )
                        "
                        class="
                            w-8
                            h-8
                            rounded-lg
                            bg-blue-50
                            text-blue-500
                            flex
                            items-center
                            justify-center
                            hover:bg-blue-500
                            hover:text-white
                        "
                    >
                        <i
                            class="
                                fa-solid
                                fa-pen
                            "
                        ></i>
                    </button>


                    <button
                        onclick="
                            removeStudent(
                                '${Number(s.id)}'
                            )
                        "
                        class="
                            w-8
                            h-8
                            rounded-lg
                            bg-red-50
                            text-red-500
                            flex
                            items-center
                            justify-center
                            hover:bg-red-500
                            hover:text-white
                        "
                    >
                        <i
                            class="
                                fa-solid
                                fa-trash
                            "
                        ></i>
                    </button>

                </div>

            </div>

        `).join('');
}


/* =========================================================
 * EDIT STUDENT
 * ========================================================= */

function editStudent(id) {
    const s =
        students.find(
            st =>
                String(st.id)
                ===
                String(id)
        );


    if (!s) return;


    document.getElementById(
        'edit-student-id'
    ).value = s.id;


    document.getElementById(
        'new-student-lrn'
    ).value = s.lrn || '';


    document.getElementById(
        'new-student-first'
    ).value = s.first || '';


    document.getElementById(
        'new-student-last'
    ).value = s.last || '';


    document.getElementById(
        'new-student-sec'
    ).value =
        s.section || 'Matapat';


    document.getElementById(
        'form-student-title'
    ).innerHTML = `
        <i
            class="
                fa-solid
                fa-user-pen
                text-blue-500
                mr-2
            "
        ></i>

        Edit Student
    `;


    document.getElementById(
        'btn-save-student'
    ).innerText =
        'Update Student';


    document.getElementById(
        'btn-cancel-student'
    ).classList.remove(
        'hidden'
    );


    document.getElementById(
        'btn-save-student'
    ).classList.replace(
        'w-full',
        'w-2/3'
    );
}


/* =========================================================
 * CANCEL EDIT
 * ========================================================= */

function cancelStudentEdit() {
    document.getElementById(
        'edit-student-id'
    ).value = '';


    document.getElementById(
        'new-student-lrn'
    ).value = '';


    document.getElementById(
        'new-student-first'
    ).value = '';


    document.getElementById(
        'new-student-last'
    ).value = '';


    document.getElementById(
        'new-student-sec'
    ).value = 'Matapat';


    document.getElementById(
        'form-student-title'
    ).innerHTML = `
        <i
            class="
                fa-solid
                fa-user-plus
                text-orange-500
                mr-2
            "
        ></i>

        Enroll Student
    `;


    document.getElementById(
        'btn-save-student'
    ).innerText =
        'Add to Class Roster';


    document.getElementById(
        'btn-cancel-student'
    ).classList.add(
        'hidden'
    );


    document.getElementById(
        'btn-save-student'
    ).classList.replace(
        'w-2/3',
        'w-full'
    );
}


/* =========================================================
 * LRN VALIDATION
 * ========================================================= */

function validateLRN(lrn) {
    return (
        lrn === '' ||
        /^[0-9]{12}$/.test(lrn)
    );
}


/* =========================================================
 * ADD / UPDATE STUDENT
 * ========================================================= */

async function addStudent(event) {
    event.preventDefault();


    applyMiddleware(
        'ADD_STUDENT',
        null,
        async () => {

            const editId =
                document.getElementById(
                    'edit-student-id'
                ).value;


            const lrn =
                document.getElementById(
                    'new-student-lrn'
                ).value.trim();


            const first =
                document.getElementById(
                    'new-student-first'
                ).value.trim();


            const last =
                document.getElementById(
                    'new-student-last'
                ).value.trim();


            const section =
                document.getElementById(
                    'new-student-sec'
                ).value.trim()
                ||
                'Matapat';


            /* =============================================
             * REQUIRE SCHOOL YEAR
             * ============================================= */

            const yearId =
                Number(
                    window.currentSchoolYearId
                );


            if (
                !Number.isInteger(yearId) ||
                yearId <= 0
            ) {

                return showErrorToast(
                    'Create or select a school year before enrolling a student.'
                );
            }


            /* =============================================
             * VALIDATION
             * ============================================= */

            if (!validateLRN(lrn)) {

                return showErrorToast(
                    'LRN must contain exactly 12 digits.'
                );
            }


            if (
                !first ||
                !last
            ) {

                return showErrorToast(
                    'First name and last name are required.'
                );
            }


            /* =============================================
             * PAYLOAD
             *
             * Every student is associated with
             * the selected school year.
             * ============================================= */

            const payload = {
                lrn:
                    lrn || null,

                first_name:
                    first,

                last_name:
                    last,

                section:
                    section,

                grade_level:
                    3,

                school_year_id:
                    yearId
            };


            try {

                const db =
                    requireSupabase();


                let result;


                /* =========================================
                 * UPDATE
                 * ========================================= */

                if (editId) {

                    result =
                        await db
                            .from('student')
                            .update(payload)
                            .eq(
                                'student_id',
                                Number(editId)
                            );

                }


                /* =========================================
                 * INSERT
                 * ========================================= */

                else {

                    result =
                        await db
                            .from('student')
                            .insert(payload);

                }


                if (result.error) {
                    throw result.error;
                }


                await fetchStudentsFromDB();


                cancelStudentEdit();


                showToast(
                    editId
                        ? 'Student updated!'
                        : 'Student saved!'
                );

            } catch (error) {

                console.error(
                    '[save student]',
                    error
                );


                if (
                    error.code === '23505'
                ) {

                    return showErrorToast(
                        'That LRN is already registered.'
                    );
                }


                if (
                    error.code === '23503'
                ) {

                    return showErrorToast(
                        'The selected school year does not exist anymore.'
                    );
                }


                showErrorToast(
                    error.message ||
                    'Failed to save student.'
                );
            }
        }
    );
}


/* =========================================================
 * EXCEL IMPORT
 * ========================================================= */

function handleExcelUpload(event) {
    const file =
        event.target.files[0];


    if (!file) return;


    /* =============================================
     * REQUIRE SCHOOL YEAR
     * ============================================= */

    const yearId =
        Number(
            window.currentSchoolYearId
        );


    if (
        !Number.isInteger(yearId) ||
        yearId <= 0
    ) {

        event.target.value = '';


        return showErrorToast(
            'Create or select a school year before importing students.'
        );
    }


    const reader =
        new FileReader();


    reader.onload =
        async function(loadEvent) {

            try {

                const data =
                    new Uint8Array(
                        loadEvent.target.result
                    );


                const workbook =
                    XLSX.read(
                        data,
                        {
                            type: 'array'
                        }
                    );


                const worksheet =
                    workbook.Sheets[
                        workbook.SheetNames[0]
                    ];


                const rows =
                    XLSX.utils.sheet_to_json(
                        worksheet,
                        {
                            header: 1
                        }
                    );


                /* =========================================
                 * FIND HEADER
                 * ========================================= */

                let headerIndex =
                    -1;


                for (
                    let i = 0;
                    i <
                    Math.min(
                        10,
                        rows.length
                    );
                    i++
                ) {

                    if (
                        rows[i]?.length &&
                        String(
                            rows[i][0]
                        )
                            .toUpperCase()
                            .includes('LRN')
                    ) {

                        headerIndex =
                            i;

                        break;
                    }
                }


                if (
                    headerIndex === -1
                ) {

                    throw new Error(
                        "Could not find the 'LRN' column."
                    );
                }


                const payload = [];


                /* =========================================
                 * BUILD STUDENTS
                 * ========================================= */

                for (
                    let i =
                        headerIndex + 1;

                    i <
                    rows.length;

                    i++
                ) {

                    const row =
                        rows[i];


                    if (
                        !row ||
                        row.length < 2
                    ) {
                        continue;
                    }


                    const lrn =
                        String(
                            row[0] ?? ''
                        ).trim();


                    const fullName =
                        String(
                            row[1] ?? ''
                        ).trim();


                    if (
                        !lrn ||
                        !fullName ||
                        !validateLRN(lrn)
                    ) {
                        continue;
                    }


                    let first =
                        fullName;


                    let last =
                        '';


                    if (
                        fullName.includes(',')
                    ) {

                        const parts =
                            fullName.split(',');


                        last =
                            parts[0].trim();


                        first =
                            parts
                                .slice(1)
                                .join(',')
                                .trim();
                    }


                    /* =====================================
                     * ASSOCIATED WITH SELECTED YEAR
                     * ===================================== */

                    payload.push({

                        lrn:
                            lrn,

                        first_name:
                            first,

                        last_name:
                            last || '-',

                        section:
                            'Matapat',

                        grade_level:
                            3,

                        school_year_id:
                            yearId
                    });
                }


                if (
                    !payload.length
                ) {

                    throw new Error(
                        'No valid 12-digit LRN student rows were found.'
                    );
                }


                showToast(
                    `Uploading ${payload.length} students...`
                );


                /* =========================================
                 * INSERT TO SUPABASE
                 * ========================================= */

                const db =
                    requireSupabase();


                const {
                    error
                } =
                    await db
                        .from('student')
                        .insert(payload);


                if (error) {
                    throw error;
                }


                await fetchStudentsFromDB();


                showToast(
                    'Excel import successful!'
                );

            } catch (error) {

                console.error(
                    '[Excel import]',
                    error
                );


                if (
                    error.code === '23505'
                ) {

                    return showErrorToast(
                        'One or more LRNs already exist.'
                    );
                }


                showErrorToast(
                    error.message ||
                    'Could not import the Excel file.'
                );

            } finally {

                const input =
                    document.getElementById(
                        'excel-upload'
                    );


                if (input) {
                    input.value = '';
                }
            }
        };


    reader.readAsArrayBuffer(
        file
    );
}


/* =========================================================
 * REMOVE STUDENT
 * ========================================================= */

async function removeStudent(id) {

    applyMiddleware(
        'REMOVE_STUDENT',
        {
            targetId: id
        },
        async () => {

            if (
                !confirm(
                    'Are you sure you want to remove this student?'
                )
            ) {
                return;
            }


            try {

                const db =
                    requireSupabase();


                const {
                    error
                } =
                    await db
                        .from('student')
                        .delete()
                        .eq(
                            'student_id',
                            Number(id)
                        );


                if (error) {
                    throw error;
                }


                /* =========================================
                 * REMOVE FROM GROUPS
                 * ========================================= */

                storedGroups.forEach(
                    group => {

                        for (
                            let i =
                                group.length - 1;

                            i >= 0;

                            i--
                        ) {

                            if (
                                String(
                                    group[i].id
                                )
                                ===
                                String(id)
                            ) {

                                group.splice(
                                    i,
                                    1
                                );
                            }
                        }
                    }
                );


                await saveGroupsToDB();


                /* =========================================
                 * CLEAR ACTIVE PLAYERS
                 * ========================================= */

                for (
                    const key of
                    [
                        'siklab_active_p1',
                        'siklab_active_p2'
                    ]
                ) {

                    try {

                        const saved =
                            JSON.parse(
                                localStorage.getItem(
                                    key
                                )
                                ||
                                'null'
                            );


                        if (
                            saved &&
                            String(saved.id)
                            ===
                            String(id)
                        ) {

                            localStorage.removeItem(
                                key
                            );
                        }

                    } catch (_) {
                    }
                }


                await fetchStudentsFromDB();


                resetSelections();


                showToast(
                    'Student removed successfully.'
                );

            } catch (error) {

                console.error(
                    '[delete student]',
                    error
                );


                showErrorToast(
                    error.message ||
                    'Could not remove student.'
                );
            }
        }
    );
}