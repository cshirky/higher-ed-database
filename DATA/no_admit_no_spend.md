# Institutions reporting neither admit rate nor instructional spend (2024)

Generated from the live database. Scope: the 2024 `institution_years` cohort
(`college` / `university` / `graduate_school`, i.e. degree-granting per
`.claude/skills/institution-scope`), filtered to rows where **both**
`admissions.pct_admitted_total` and `finance.instruction_expense_per_fte`
are null for 2024.

These are the institutions that make a similarity score unreliable: with two of
the four peer dimensions absent, they match on whatever little they do report.
Under a 31-field feature set they can share almost nothing with a target
institution and still score a perfect 0.000 distance.

## Summary

- **146** institutions, of 4,090 in the 2024 cohort (3.6%)
- **52** recover at least one dimension from 2023 via the one-year fallback
- **94** are still missing both after fallback — the genuinely blind set
- **8** granted any bachelor's degrees in 2024
- **6** both grant bachelor's **and** are still blind after fallback
- **127** granted no associate's, bachelor's, master's or doctoral degrees at all in 2024

## Relevance to a bachelor's-seeking audience

Filtering to institutions that actually grant bachelor's degrees removes 138 of
the 146 outright. Of the 8 that remain, 6 are still missing both
dimensions after the one-year fallback. A selectivity requirement would cut
further still: an institution with no admit rate in either year cannot be shown
to meet a selectivity threshold at all.

## The institutions

`Fallback` shows whether 2023 supplied the missing admit rate (A), instructional
spend (I), both, or neither. Degree counts are 2024 completions.

| # | Institution | St | Control | Type | Highest offering | Enrolled | UG | Grad | Assoc | Bach | Mast | Doct | Fallback |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Pennsylvania College of Technology | PA | Public | University | Master's | 4,575 | 4,526 | 49 | 644 | 430 | 2 | 0 | none |
| 2 | American College of Education | IN | Private for-profit | University | Doctoral | 14,263 | 359 | 13,904 | 0 | 108 | 4,938 | 286 | none |
| 3 | Platt College-Aurora | CO | Private for-profit | College | Bachelor's | — | — | — | 0 | 85 | 0 | 0 | A+I |
| 4 | Salish Kootenai College | MT | Public | University | Master's | 671 | 636 | 35 | 47 | 65 | 19 | 0 | none |
| 5 | Sinte Gleska University | SD | Public | University | Master's | 592 | 515 | 77 | 36 | 33 | 12 | 0 | none |
| 6 | Faith Theological Seminary and Christian College | FL | Private nonprofit | University | Doctoral | — | — | — | 10 | 26 | 7 | 3 | none |
| 7 | Montana Bible College | MT | Private nonprofit | College | Bachelor's | 36 | 36 | 0 | 0 | 10 | 0 | 0 | A |
| 8 | Newlane University | UT | Private for-profit | College | Bachelor's | — | — | — | 1 | 1 | 0 | 0 | none |
| 9 | Naval Postgraduate School | CA | Public | Grad school | Doctoral | 2,441 | 0 | 2,441 | 0 | 0 | 1,040 | 16 | none |
| 10 | Eastern Virginia Medical School | VA | Public | Grad school | Doctoral | 1,216 | 0 | 1,216 | 0 | 0 | 218 | 172 | none |
| 11 | Air Force Institute of Technology-Graduate School of Engineering & Management | OH | Public | Grad school | Doctoral | 1,070 | 0 | 1,070 | 0 | 0 | 271 | 33 | none |
| 12 | Reformed University | GA | Private nonprofit | University | Master's | 294 | 253 | 41 | — | — | — | 0 | A+I |
| 13 | Little Priest Tribal College | NE | Public | College | Associate's | 218 | 218 | 0 | 15 | — | — | 0 | none |
| 14 | Pennsylvania State University-Penn State Great Valley | PA | Public | Grad school | Master's | 212 | 0 | 212 | 0 | 0 | 101 | 0 | none |
| 15 | California Indian Nations College | CA | Public | College | Associate's | 154 | 154 | 0 | 14 | — | — | 0 | none |
| 16 | Larkin University | FL | Private nonprofit | Grad school | Doctoral | 127 | 0 | 127 | — | — | — | 0 | none |
| 17 | Windsor University | DC | Private for-profit | University | Doctoral | 49 | 0 | 49 | 0 | 0 | 0 | 0 | none |
| 18 | Toyota Technological Institute at Chicago | IL | Private nonprofit | Grad school | Doctoral | 39 | 0 | 39 | 0 | 0 | 0 | 7 | I |
| 19 | Elmezzi Graduate School of Molecular Medicine | NY | Private nonprofit | Grad school | Doctoral | 12 | 0 | 12 | — | — | — | 0 | I |
| 20 | Ricketts Great Books College | NE | Private for-profit | University | Master's | 6 | 6 | 0 | 0 | 0 | 0 | 0 | none |
| 21 | AOMA Graduate School of Integrative Medicine | TX | Private for-profit | Grad school | Doctoral | — | — | — | — | — | — | 0 | I |
| 22 | Acupuncture and Massage College | FL | Private for-profit | University | Master's | — | — | — | — | — | — | 0 | I |
| 23 | Agora University | VA | Private nonprofit | Grad school | Doctoral | — | — | — | — | — | — | 0 | none |
| 24 | Alamo Community College District Central Office | TX | Public | College | Bachelor's | — | — | — | — | — | — | 0 | none |
| 25 | American Academy of Art College | IL | Private for-profit | College | Bachelor's | — | — | — | — | — | — | 0 | I |
| 26 | American University of Puerto Rico | PR | Private nonprofit | University | Master's | — | — | — | — | — | — | 0 | I |
| 27 | Antioch University-System Administration | OH | Private nonprofit | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 28 | Arizona Board of Regents | AZ | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 29 | Arkansas State University System | AR | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 30 | Bacone College | OK | Private nonprofit | College | Bachelor's | — | — | — | — | — | — | 0 | I |
| 31 | Birmingham-Southern College | AL | Private nonprofit | University | Master's | — | — | — | — | — | — | 0 | A+I |
| 32 | Board of Trustees-Mississippi State Institutions of Higher Learning | MS | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 33 | CUNY System Office | NY | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 34 | Cabrini University | PA | Private nonprofit | University | Doctoral | — | — | — | — | — | — | 0 | A+I |
| 35 | California Institute of Arts & Technology-National City | CA | Private for-profit | College | Bachelor's | — | — | — | — | — | — | 0 | I |
| 36 | California State University-Chancellors Office | CA | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 37 | Career College of Northern Nevada | NV | Private for-profit | College | Associate's | — | — | — | — | — | — | 0 | none |
| 38 | Carrington College-Administrative Office | CA | Private for-profit | College | Bachelor's | — | — | — | — | — | — | 0 | none |
| 39 | Chamberlain University-Administrative Office | IL | Private for-profit | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 40 | City College-Hollywood | FL | Private for-profit | College | Bachelor's | — | — | — | — | — | — | 0 | none |
| 41 | City Colleges of Chicago-District Office | IL | Public | College | Associate's | — | — | — | — | — | — | 0 | none |
| 42 | Clarks Summit University | PA | Private nonprofit | University | Doctoral | — | — | — | — | — | — | 0 | A+I |
| 43 | Coast Community College District Office | CA | Public | College | 2-4yr cert | — | — | — | — | — | — | 0 | none |
| 44 | Colorado State University-System Office | CO | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 45 | Contra Costa Community College District Office | CA | Public | College | Associate's | — | — | — | — | — | — | 0 | none |
| 46 | DeVry University-Administrative Office | IL | Private for-profit | University | Master's | — | — | — | — | — | — | 0 | none |
| 47 | Delaware College of Art and Design | DE | Private nonprofit | College | Associate's | — | — | — | — | — | — | 0 | A+I |
| 48 | Delaware Technical Community College-Central Office | DE | Public | College | Bachelor's | — | — | — | — | — | — | 0 | none |
| 49 | Digital Film Academy | NY | Private for-profit | College | Associate's | — | — | — | — | — | — | 0 | I |
| 50 | Eastern Gateway Community College | OH | Public | College | Associate's | — | — | — | 6,364 | — | — | 0 | I |
| 51 | Florida Career College-Boynton Beach | FL | Private for-profit | College | Associate's | — | — | — | — | — | — | 0 | I |
| 52 | Florida Career College-Hialeah | FL | Private for-profit | College | Associate's | — | — | — | — | — | — | 0 | I |
| 53 | Florida Career College-Houston | TX | Private for-profit | College | Associate's | — | — | — | — | — | — | 0 | I |
| 54 | Florida Career College-Lauderdale Lakes | FL | Private for-profit | College | Associate's | — | — | — | — | — | — | 0 | I |
| 55 | Florida Career College-Margate | FL | Private for-profit | College | Associate's | — | — | — | — | — | — | 0 | I |
| 56 | Florida Career College-Miami | FL | Private for-profit | College | Associate's | — | — | — | — | — | — | 0 | I |
| 57 | Florida Career College-West Palm Beach | FL | Private for-profit | College | Associate's | — | — | — | — | — | — | 0 | I |
| 58 | Foothill-De Anza Community College District | CA | Public | College | Bachelor's | — | — | — | — | — | — | 0 | none |
| 59 | Frontier Community College | IL | Public | College | Associate's | — | — | — | — | — | — | 0 | I |
| 60 | Goddard College | VT | Private nonprofit | University | Master's | — | — | — | — | — | — | 0 | A+I |
| 61 | Grossmont-Cuyamaca Community College District | CA | Public | College | 2-4yr cert | — | — | — | — | — | — | 0 | none |
| 62 | Hodges University | FL | Private nonprofit | University | Master's | — | — | — | — | — | — | 0 | I |
| 63 | Houston International College Cardiotech Ultrasound School | TX | Private for-profit | College | 2-4yr cert | — | — | — | — | — | — | 0 | A+I |
| 64 | Illinois Eastern Community College-System Office | IL | Public | College | Associate's | — | — | — | — | — | — | 0 | none |
| 65 | Institute of Lutheran Theology | SD | Private nonprofit | University | Doctoral | — | — | — | 1 | 0 | 11 | 4 | none |
| 66 | Inter American University of Puerto Rico-Central Office | PR | Private nonprofit | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 67 | International College of Broadcasting | OH | Private for-profit | College | Associate's | — | — | — | — | — | — | 0 | I |
| 68 | Johnson University Florida | FL | Private nonprofit | College | Bachelor's | — | — | — | — | — | — | 0 | A+I |
| 69 | Kentucky Community and Technical College System | KY | Public | College | 2-4yr cert | — | — | — | — | — | — | 0 | none |
| 70 | Key College | FL | Private for-profit | College | Associate's | — | — | — | — | — | — | 0 | I |
| 71 | Learnet Academy Inc | CA | Private for-profit | University | Master's | — | — | — | — | — | — | 0 | none |
| 72 | Lincoln Christian University | IL | Private nonprofit | University | Doctoral | — | — | — | — | — | — | 0 | I |
| 73 | Lincoln Trail College | IL | Public | College | Associate's | — | — | — | — | — | — | 0 | I |
| 74 | Long Island Business Institute | NY | Private for-profit | College | 2-4yr cert | — | — | — | — | — | — | 0 | A+I |
| 75 | Los Angeles Community College District Office | CA | Public | College | Bachelor's | — | — | — | — | — | — | 0 | none |
| 76 | Los Rios Community College District Office | CA | Public | College | 2-4yr cert | — | — | — | — | — | — | 0 | none |
| 77 | Magdalen College | NH | Private nonprofit | College | Bachelor's | — | — | — | — | — | — | 0 | A+I |
| 78 | Maricopa Community College System Office | AZ | Public | College | Bachelor's | — | — | — | — | — | — | 0 | none |
| 79 | Minnesota State Colleges and Universities System Office | MN | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 80 | Mississippi Community College Board | MS | Public | College | 2-4yr cert | — | — | — | — | — | — | 0 | none |
| 81 | Multnomah University | OR | Private nonprofit | University | Doctoral | — | — | — | — | — | — | 0 | A+I |
| 82 | Nevada System of Higher Education-System Office | NV | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 83 | New York Theological Seminary | NY | Private nonprofit | Grad school | Doctoral | — | — | — | 0 | 0 | 33 | 10 | I |
| 84 | North Orange County Community College District | CA | Public | College | Bachelor's | — | — | — | — | — | — | 0 | none |
| 85 | Northwestern College | IL | Private for-profit | College | Bachelor's | — | — | — | — | — | — | 0 | I |
| 86 | Notre Dame College | OH | Private nonprofit | University | Master's | — | — | — | — | — | — | 0 | A |
| 87 | Oregon College of Oriental Medicine | OR | Private nonprofit | Grad school | Doctoral | — | — | — | — | — | — | 0 | I |
| 88 | Paier College | CT | Private for-profit | University | Master's | — | — | — | — | — | — | 0 | A+I |
| 89 | Pennsylvania State System of Higher Education-Central Office | PA | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 90 | Peralta Community College System Office | CA | Public | College | 2-4yr cert | — | — | — | — | — | — | 0 | none |
| 91 | Pittsburgh Technical College | PA | Private nonprofit | College | Bachelor's | — | — | — | — | — | — | 0 | I |
| 92 | Pontifex University | GA | Private nonprofit | Grad school | Doctoral | — | — | — | 0 | 0 | 0 | 6 | none |
| 93 | Pope St John XXIII National Seminary | MA | Private nonprofit | Grad school | Master's | — | — | — | — | — | — | 0 | I |
| 94 | Rancho Santiago Community College District Office | CA | Public | College | Bachelor's | — | — | — | — | — | — | 0 | none |
| 95 | Rensselaer at Hartford | CT | Private nonprofit | Grad school | Post-master's cert | — | — | — | — | — | — | 0 | I |
| 96 | SUNY-System Office | NY | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 97 | San Bernardino Community College District | CA | Public | College | 2-4yr cert | — | — | — | — | — | — | 0 | none |
| 98 | San Diego Community College District-District Office | CA | Public | College | Bachelor's | — | — | — | — | — | — | 0 | none |
| 99 | San Joaquin Valley College-Central Administrative Office | CA | Private for-profit | College | Bachelor's | — | — | — | — | — | — | 0 | none |
| 100 | San Jose-Evergreen Community College District | CA | Public | College | Associate's | — | — | — | — | — | — | 0 | none |
| 101 | San Mateo County Community College District Office | CA | Public | College | Bachelor's | — | — | — | — | — | — | 0 | none |
| 102 | Sistema Universitario Ana G. Mendez | PR | Private nonprofit | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 103 | South Orange County Community College District | CA | Public | College | 2-4yr cert | — | — | — | — | — | — | 0 | none |
| 104 | Southern Illinois University-System Office | IL | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 105 | Southern University-Board and System | LA | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 106 | State Center Community College District | CA | Public | College | Bachelor's | — | — | — | — | — | — | 0 | none |
| 107 | Tennessee Board of Regents | TN | Public | College | 2-4yr cert | — | — | — | — | — | — | 0 | none |
| 108 | Texas A & M University-System Office | TX | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 109 | Texas Tech University System Administration | TX | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 110 | The College of Saint Rose | NY | Private nonprofit | University | Post-master's cert | — | — | — | — | — | — | 0 | A+I |
| 111 | The University of America | CA | Private nonprofit | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 112 | The University of Tennessee System Office | TN | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 113 | The University of Texas System Office | TX | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 114 | Trinity International University-Florida | FL | Private nonprofit | University | Master's | — | — | — | — | — | — | 0 | I |
| 115 | University System of Maryland | MD | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 116 | University System of Maryland-Research Centers | MD | Public | Grad school | Doctoral | — | — | — | — | — | — | 0 | none |
| 117 | University System of New Hampshire System Office | NH | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 118 | University of Alabama System Office | AL | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 119 | University of Alaska System of Higher Education | AK | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 120 | University of Antelope Valley | CA | Private for-profit | University | Master's | — | — | — | — | — | — | 0 | none |
| 121 | University of Arkansas System Office | AR | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 122 | University of California-System Administration Central Office | CA | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 123 | University of Colorado System Office | CO | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 124 | University of Hawaii System Office | HI | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 125 | University of Houston-System Administration | TX | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 126 | University of Illinois System Offices | IL | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 127 | University of Louisiana-System Administration | LA | Public | College | Bachelor's | — | — | — | — | — | — | 0 | none |
| 128 | University of Maine-System Central Office | ME | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 129 | University of Massachusetts-Central Office | MA | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 130 | University of Missouri-System Office | MO | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 131 | University of Nebraska-Central Administration System Office | NE | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 132 | University of North Carolina System | NC | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 133 | University of North Texas System | TX | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 134 | University of Phoenix-Nevada | NV | Private for-profit | University | Master's | — | — | — | — | — | — | 0 | I |
| 135 | University of Puerto Rico-Central Administration | PR | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 136 | University of Saint Katherine | CA | Private nonprofit | University | Master's | — | — | — | — | — | — | 0 | A+I |
| 137 | University of Wisconsin-System Administration | WI | Public | University | Doctoral | — | — | — | — | — | — | 0 | none |
| 138 | University of the Arts | PA | Private nonprofit | University | Doctoral | — | — | — | — | — | — | 0 | A+I |
| 139 | Valley College of Medical Careers | CA | Private for-profit | College | Associate's | — | — | — | 0 | — | — | 0 | I |
| 140 | Ventura County Community College System Office | CA | Public | College | 2-4yr cert | — | — | — | — | — | — | 0 | none |
| 141 | Vermont State Colleges-Office of the Chancellor | VT | Public | University | Post-master's cert | — | — | — | — | — | — | 0 | none |
| 142 | Wabash Valley College | IL | Public | College | Associate's | — | — | — | — | — | — | 0 | I |
| 143 | Wells College | NY | Private nonprofit | College | Bachelor's | — | — | — | — | — | — | 0 | A+I |
| 144 | West Hills Community College District | CA | Public | College | Associate's | — | — | — | — | — | — | 0 | none |
| 145 | West Valley Mission Community College District Office | CA | Public | College | 2-4yr cert | — | — | — | — | — | — | 0 | none |
| 146 | Yosemite Community College District Office | CA | Public | College | Bachelor's | — | — | — | — | — | — | 0 | none |

## Bachelor's-granting subset, still blind after fallback

The set that would survive an audience filter and still degrade similarity.

| Institution | St | Control | Enrolled | Bach | Mast | Doct |
|---|---|---|---|---|---|---|
| Pennsylvania College of Technology | PA | Public | 4,575 | 430 | 2 | 0 |
| American College of Education | IN | Private for-profit | 14,263 | 108 | 4,938 | 286 |
| Salish Kootenai College | MT | Public | 671 | 65 | 19 | 0 |
| Sinte Gleska University | SD | Public | 592 | 33 | 12 | 0 |
| Faith Theological Seminary and Christian College | FL | Private nonprofit | — | 26 | 7 | 3 |
| Newlane University | UT | Private for-profit | — | 1 | 0 | 0 |

## How to regenerate

No script is checked in for this; it was a one-off query against the 2024 data.
The filter is the two `is null` conditions above — rerun it after any backfill,
since IPEDS may publish the missing components for 2024-25 later.
