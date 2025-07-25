
process.env.AWS_REGION = 'us-west-2';
process.env.PrimaryTable = 'mytaptrack-test-primary';
process.env.DataTable = 'mytaptrack-test-data';

import { StudentDal } from './student-dal';
import { typesV2 } from '@mytaptrack/types';
import { StudentConfigStorage, moment } from '../..';

const userId = 'f299c614-2537-4c72-bab7-1aaa5734d7c3';
const studentId = '0799002d-dafd-4859-b95e-da1bda89f083';
const license = '202012316a147c1978f645abb14c6148015a7a19';

describe('StudentDal', () => {
    test('getStudent', async () => {
        const student = await StudentDal.getStudent(studentId, userId);
        expect(student).toBeDefined();
    });

    test('getStudentsByLicense', async () => {
        const students = await StudentDal.getStudentsByLicense("202012316a147c1978f645abb14c6148015a7a19");
        console.log(students);
        expect(students).toBeDefined();
        expect(students.length).toBe(12);
        const automation = students.find(x => x.studentId == "625793de-d8e0-4636-ab8b-9258a6803115");
        expect(automation).toBeDefined();
        expect(automation?.behaviors.length).toBe(8);
        expect(automation?.licenseDetails?.flexible).toBe(true);
    });

    test('setStudentAbc', async () => {
        const student = await StudentDal.getStudent(studentId, userId);
        const abc = {
            name: 'Overwrite',
            antecedents: [
                new Date().toISOString()
            ],
            consequences: [
                new Date().toISOString()
            ],
            tags: []
        };
        await StudentDal.setStudentAbc(student.studentId, student.license!, abc);
        await new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, 1000)});
        const student2 = await StudentDal.getStudent(studentId, userId);
        expect(student2.abc!.antecedents[0]).toBe(abc.antecedents[0]);

        await StudentDal.setStudentAbc(student.studentId, student.license!, undefined);
        const student3 = await StudentDal.getStudent(studentId, userId);
        expect(student3.abc).toBeUndefined();
    });
    test('StudentNoLicense', async () => {
        await StudentDal.saveStudent({
            "studentId":"2a2a0c7c-3b87-4d2c-b55b-c2255bc6c333",
            license: undefined,
            licenseDetails: undefined,
            details:{
                firstName:"Test 2",
                lastName:"Student",
                nickname:""
            },
            behaviors:[
                {
                    name:"Test 1",
                    isArchived:false,
                    id:"c4c75cb1-4f38-4f04-bbe6-5c95f166769d",
                    targets:[],
                    tags:[]
                }
            ],
            documents: [],
            services: [],
            responses: undefined as any,
            restrictions: undefined as any,
            milestones: undefined as any,
            lastTracked: undefined as any,
            lastUpdateDate: undefined as any,
            schedules:[],
            tags:["Test"],
            version:1});
    }, 30000);

    describe('updateProjection', () => {

        describe('Current', () => {
            test('NoDetail-WeekTracking', () => {
                const service: any = {
                    period: 'week',
                    target: 5,
                    projected: 20
                }
                const student = getServiceStudent(moment('2023-04-16').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-04-19'), service, student);
                expect(output.previousPeriod).toBe(20);
                expect(output.nextPeriod).toBe(22);
            });
    
            test('NoDetail-WeekTracking-Start', () => {
                const service: any = {
                    period: 'week',
                    target: 5,
                    projected: 20
                }
                const student = getServiceStudent(moment('2023-04-16').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-04-17'), service, student);
                expect(output.previousPeriod).toBe(20);
                expect(output.nextPeriod).toBe(20);
            });
    
            test('NoDetail-WeekTracking-End', () => {
                const service: any = {
                    period: 'week',
                    target: 5,
                    projected: 20
                }
                const student = getServiceStudent(moment('2023-04-16').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-04-22'), service, student);
                expect(output.previousPeriod).toBe(20);
                expect(output.nextPeriod).toBe(25);
            });
        });
        
        describe('OutOfDate', () => {
            test('adjust-end-of-period', () => {
                const service: any = {
                    period: 'week',
                    target: 5,
                    projected: 19
                }
                const student = getServiceStudent(moment('2023-04-14').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-04-19'), service, student);
                expect(output.previousPeriod).toBe(20);
                expect(output.nextPeriod).toBe(22);
            });
            test('NoDetail-WeekTracking-Current', () => {
                const service: any = {
                    period: 'week',
                    target: 5,
                    projected: 15
                }
                const student = getServiceStudent(moment('2023-04-09').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-04-19'), service, student);
                expect(output.previousPeriod).toBe(20);
                expect(output.nextPeriod).toBe(22);
            });
    
            test('NoDetail-WeekTracking-Start', () => {
                const service: any = {
                    period: 'week',
                    target: 5,
                    projected: 15
                }
                const student = getServiceStudent(moment('2023-04-09').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-04-17'), service, student);
                expect(output.previousPeriod).toBe(20);
                expect(output.nextPeriod).toBe(20);
            });
    
            test('NoDetail-WeekTracking-End', () => {
                const service: any = {
                    period: 'week',
                    target: 5,
                    projected: 15
                }
                const student = getServiceStudent(moment('2023-04-09').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-04-22'), service, student);
                expect(output.previousPeriod).toBe(20);
                expect(output.nextPeriod).toBe(25);
            });
        });

        describe('Month-Current', () => {
            test('Mid', () => {
                const service: any = {
                    period: 'month',
                    target: 30,
                    projected: 20
                }
                const student = getServiceStudent(moment('2023-04-09').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-04-15'), service, student);
                expect(output.previousPeriod).toBe(20);
                expect(output.nextPeriod).toBe(26);
            });
    
            test('NoDetail-Start', () => {
                const service: any = {
                    period: 'month',
                    target: 30,
                    projected: 20
                }
                const student = getServiceStudent(moment('2023-04-01').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-04-01'), service, student);
                expect(output.previousPeriod).toBe(20);
                expect(output.nextPeriod).toBe(20);
            });
    
            test('NoDetail-End', () => {
                const service: any = {
                    period: 'month',
                    target: 30,
                    projected: 8
                }
                const student = getServiceStudent(moment('2023-04-09').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-04-30'), service, student);
                expect(output.previousPeriod).toBe(8);
                expect(output.nextPeriod).toBe(29);
            });

            test('31 last day', () => {
                const service: any = {
                    period: 'month',
                    target: 30,
                    projected: 29
                }
                const student = getServiceStudent(moment('2023-03-31').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-04-1'), service, student);
                expect(output.previousPeriod).toBe((30/31) + 29);
                expect(output.nextPeriod).toBe((30/31) + 29);
            });

            test('28 last day', () => {
                const service: any = {
                    period: 'month',
                    target: 30,
                    projected: 29
                }
                const student = getServiceStudent(moment('2023-02-28').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-03-1'), service, student);
                expect(output.previousPeriod).toBe((30/28) + 29);
                expect(output.nextPeriod).toBe((30/28) + 29);
            });
        });

        describe('Month-OutOfDate', () => {
            test('Mid', () => {
                const service: any = {
                    period: 'month',
                    target: 30,
                    projected: 20
                }
                const student = getServiceStudent(moment('2023-03-01').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-04-15'), service, student);
                expect(output.previousPeriod).toBe(50);
                expect(output.nextPeriod).toBe(64);
            });
    
            test('NoDetail-Start', () => {
                const service: any = {
                    period: 'month',
                    target: 30,
                    projected: 20
                }
                const student = getServiceStudent(moment('2023-03-01').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-04-01'), service, student);
                expect(output.previousPeriod).toBe(50);
                expect(output.nextPeriod).toBe(50);
            });
    
            test('NoDetail-End', () => {
                const service: any = {
                    period: 'month',
                    target: 30,
                    projected: 15
                }
                const student = getServiceStudent(moment('2023-04-01').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-04-30'), service, student);
                expect(output.previousPeriod).toBe(15);
                expect(output.nextPeriod).toBe(44);
            });

            test('OneDayRollover', () => {
                const service: any = {
                    period: 'month',
                    target: 30,
                    projected: 29
                }
                const student = getServiceStudent(moment('2023-04-30').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-05-01'), service, student);
                expect(output.previousPeriod).toBe(30);
                expect(output.nextPeriod).toBe(30);
            });
        });

        describe('Month-OutOfDate-Partial', () => {
            test('Mid', () => {
                const service: any = {
                    period: 'month',
                    target: 30,
                    projected: 8 // current tracking does not track current day
                }
                const student = getServiceStudent(moment('2023-04-9').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-05-15'), service, student);
                expect(output.previousPeriod).toBe(30);
                expect(output.nextPeriod).toBe(30 + (14 * 30 / 31));
            });
    
            test('NoDetail-Start', () => {
                const service: any = {
                    period: 'month',
                    target: 30,
                    projected: 14
                }
                const student = getServiceStudent(moment('2023-04-15').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-05-01'), service, student);
                expect(output.previousPeriod).toBe(30);
                expect(output.nextPeriod).toBe(30);
            });
    
            test('NoDetail-End', () => {
                const service: any = {
                    period: 'month',
                    target: 30,
                    projected: 14
                }
                const student = getServiceStudent(moment('2023-04-15').toDate().getTime());
                const output = StudentDal.updateProjection(moment('2023-05-31'), service, student);
                expect(output.previousPeriod).toBe(30);
                expect(output.nextPeriod).toBe(30 + (30 * 30 / 31));
            });
        });

        describe('Year-Current', () => {
            test('Mid', () => {
                const student = getServiceStudent(moment('2022-09-01').toDate().getTime());
                const service: any = {
                    period: 'schoolYear',
                    target: student!.schoolYear!.days * 2,
                    projected: 0 // current tracking does not track current day
                }
                const output = StudentDal.updateProjection(moment('2022-09-01'), service, student);
                expect(output.previousPeriod).toBe(0);
                expect(output.nextPeriod).toBe(0);
            });

            test('StartDate used rather than school year', () => {
                const student = getServiceStudent(moment('2022-09-01').toDate().getTime());
                const service: any = {
                    period: 'schoolYear',
                    target: (student!.schoolYear!.days - 15) * 2,
                    projected: 0, // current tracking does not track current day
                    startDate: '2022-09-15'
                }
                const output = StudentDal.updateProjection(moment('2022-09-30'), service, student);
                expect(output.previousPeriod).toBe(0);
                expect(output.nextPeriod).toBe(30);
            });
    
            test('NoDetail-Start', () => {
                const student = getServiceStudent(moment('2023-04-15').toDate().getTime());
                const service: any = {
                    period: 'schoolYear',
                    target: student!.schoolYear!.days * 2,
                    projected: 30 // current tracking does not track current day
                };
                const output = StudentDal.updateProjection(moment('2023-05-01'), service, student);
                expect(output.previousPeriod).toBe(30);
                expect(output.nextPeriod).toBe(30 + (16 * 2));
            });
    
            test('NoDetail-End', () => {
                const student = getServiceStudent(moment('2023-04-15').toDate().getTime());
                const service: any = {
                    period: 'schoolYear',
                    target: student!.schoolYear!.days * 2,
                    projected: 30 // current tracking does not track current day
                };
                const output = StudentDal.updateProjection( moment('2023-05-31'), service, student);
                expect(output.previousPeriod).toBe(30);
                expect(output.nextPeriod).toBe(30 + ((15 + 31) * 2));
            });
        });

        describe("Scheduled times", () => {
            describe("week", () => {
                test("Beginning of week", () => {
                    const service: any = {
                        period: 'week',
                        target: 5,
                        projected: 15,
                        detailedTargets: [
                            { day: 1, target: 1 },
                            { day: 3, target: 2 },
                            { day: 4, target: 2 },
                            { day: 5, target: 0 },
                        ]
                    }
                    const student = getServiceStudent(moment('2023-04-09').toDate().getTime());
                    const output = StudentDal.updateProjection(moment('2023-04-10'), service, student);
                    expect(output.previousPeriod).toBe(15);
                    expect(output.nextPeriod).toBe(15);
                });

                test("Add 1 item", () => {
                    const service: any = {
                        period: 'week',
                        target: 5,
                        projected: 15,
                        detailedTargets: [
                            { day: 1, target: 1 },
                            { day: 3, target: 2 },
                            { day: 4, target: 2 },
                            { day: 5, target: 0 },
                        ]
                    }
                    const student = getServiceStudent(moment('2023-04-09').toDate().getTime());
                    const output = StudentDal.updateProjection(moment('2023-04-11'), service, student);
                    expect(output.previousPeriod).toBe(15);
                    expect(output.nextPeriod).toBe(16);
                });

                test("Add 2 items", () => {
                    const service: any = {
                        period: 'week',
                        target: 5,
                        projected: 15,
                        detailedTargets: [
                            { day: 1, target: 1 },
                            { day: 3, target: 2 },
                            { day: 4, target: 2 },
                            { day: 5, target: 0 },
                        ]
                    };
                    const student = getServiceStudent(moment('2023-04-09').toDate().getTime());
                    const output = StudentDal.updateProjection(moment('2023-04-13'), service, student);
                    expect(output.previousPeriod).toBe(15);
                    expect(output.nextPeriod).toBe(18);
                });

                test("Add partial week items", () => {
                    const service: any = {
                        period: 'week',
                        target: 5,
                        projected: 15,
                        detailedTargets: [
                            { day: 1, target: 1 },
                            { day: 3, target: 2 },
                            { day: 4, target: 2 },
                            { day: 5, target: 0 },
                        ]
                    };
                    const student = getServiceStudent(moment('2023-04-13').toDate().getTime());
                    const output = StudentDal.updateProjection(moment('2023-04-16'), service, student);
                    expect(output.previousPeriod).toBe(17);
                    expect(output.nextPeriod).toBe(17);
                });
            });
        });
        describe("Excluded dates", () => {
            describe("scheduled", () => {
                test("Week - Remove 1 day", () => {
                    const service: any = {
                        period: 'week',
                        target: 15,
                        projected: 15,
                        deficit: 0,
                        detailedTargets: [
                            { day: 1, target: 1 },
                            { day: 2, target: 2 },
                            { day: 3, target: 3 },
                            { day: 4, target: 4 },
                            { day: 5, target: 5 },
                        ]
                    };
                    const student = getServiceStudent(moment('2023-04-09').toDate().getTime());
                    student.futureExclusions.push(moment('2023-04-10').toDate().getTime());
                    const output = StudentDal.updateProjection(moment('2023-04-15'), service, student);
                    expect(output.previousPeriod).toBe(15);
                    expect(output.nextPeriod).toBe(30 - 1);
                    expect(output.deficit).toBe(1);
                });

                test("Week - Remove 3 days", () => {
                    const service: any = {
                        period: 'week',
                        target: 15,
                        projected: 15,
                        deficit: 0,
                        detailedTargets: [
                            { day: 1, target: 1 },
                            { day: 2, target: 2 },
                            { day: 3, target: 3 },
                            { day: 4, target: 4 },
                            { day: 5, target: 5 },
                        ]
                    };
                    const student = getServiceStudent(moment('2023-04-09').toDate().getTime());
                    student.futureExclusions.push(moment('2023-04-10').toDate().getTime());
                    student.futureExclusions.push(moment('2023-04-11').toDate().getTime());
                    student.futureExclusions.push(moment('2023-04-13').toDate().getTime());
                    const output = StudentDal.updateProjection(moment('2023-04-15'), service, student);
                    expect(output.previousPeriod).toBe(15);
                    expect(output.nextPeriod).toBe(30 - 1 - 2 - 4);
                    expect(output.deficit).toBe(7);
                });

                test("Month - Remove 1 day", () => {
                    const targets: any[] = [];
                    let total = 0;
                    let expectedTotal = 0;
                    const lastUpdate = moment('2023-04-01');
                    const time1 = moment('2023-04-10');
                    for(let i = 0; i < 30; i++) {
                        if(i != 9 && lastUpdate.isSameOrBefore(time1)) {
                            expectedTotal += i;
                        }
                        total += i;
                        targets.push({ day: i, target: i});
                    }
                    const service: any = {
                        period: 'month',
                        target: total,
                        projected: 15,
                        deficit: 0,
                        detailedTargets: targets
                    };
                    const student = getServiceStudent(moment('2023-04-01').toDate().getTime());
                    student.futureExclusions.push(time1.toDate().getTime());

                    const output = StudentDal.updateProjection(moment('2023-04-30'), service, student);

                    expect(output.previousPeriod).toBe(15);
                    expect(output.nextPeriod).toBe(15 + expectedTotal);
                    expect(output.deficit).toBe(9);
                });

                test("Month - Remove 3 days", () => {
                    const targets: any[] = [];
                    let total = 0;
                    let expectedTotal = 0;
                    const lastUpdate = moment('2023-04-01');
                    const time1 = moment('2023-04-10');
                    for(let i = 0; i < 30; i++) {
                        const targetData = { day: i, target: i + 1};
                        if(i != 9 && i != 0 && i != 19 && i != 24) {
                            expectedTotal += targetData.target;
                        }
                        total += i;
                        targets.push(targetData);
                    }
                    const service: any = {
                        period: 'month',
                        target: total,
                        projected: 15,
                        deficit: 0,
                        detailedTargets: targets
                    };
                    const student = getServiceStudent(lastUpdate.toDate().getTime());
                    student.futureExclusions.push(moment('2023-04-01').toDate().getTime());
                    student.futureExclusions.push(moment('2023-04-10').toDate().getTime());
                    student.futureExclusions.push(moment('2023-04-20').toDate().getTime());
                    student.futureExclusions.push(moment('2023-04-25').toDate().getTime());

                    const output = StudentDal.updateProjection(moment('2023-04-30'), service, student);
                    
                    expect(output.previousPeriod).toBe(15);
                    expect(output.nextPeriod).toBe(15 + expectedTotal);
                    expect(output.deficit).toBe(56);
                });

                test("Year - Remove 3 days", () => {
                    const targets: any[] = [];
                    const student = getServiceStudent(moment('2022-09-01').toDate().getTime());
                    student.schoolYear = {
                        beginning: '09-01',
                        end: '06-20',
                        days: moment('2023-06-20').diff(moment('2022-09-01'), 'days')
                    };
                    const beginning = moment('2022-' + student.schoolYear.beginning);
                    const ending = moment('2023-06-20');
                    const endingOffset = ending.diff(beginning, 'days');
                    const time1 = moment('2022-09-10');
                    const time1Offset = time1.diff(beginning, 'days');
                    const time2 = moment('2022-11-20');
                    const time2Offset = time2.diff(beginning, 'days');
                    const time3 = moment('2023-04-15');
                    const time3Offset = time3.diff(beginning, 'days');

                    let total = 0;
                    let expectedTotal = 0;
                    let resultsInExpected = 0;
                    for(let i = 0; i < student.schoolYear.days; i++) {
                        if(i <= endingOffset && i != time1Offset && i != time2Offset && i != time3Offset) {
                            expectedTotal += i;
                            resultsInExpected++;
                        }
                        total += i;
                        targets.push({ day: i, target: i});
                    }
                    const service: any = {
                        period: 'schoolYear',
                        target: total,
                        projected: 15,
                        deficit: 0,
                        detailedTargets: targets
                    };
                    
                    student.futureExclusions.push(time1.toDate().getTime());
                    student.futureExclusions.push(time2.toDate().getTime());
                    student.futureExclusions.push(time3.toDate().getTime());
                    const output = StudentDal.updateProjection(ending, service, student);

                    console.log('resultsInExpected', resultsInExpected);
                    expect(output.previousPeriod).toBe(15);
                    expect(output.nextPeriod - expectedTotal).toBe(0);
                    expect(output.nextPeriod).toBe(expectedTotal);
                    expect(output.deficit).toBe(time1Offset + time2Offset + time3Offset);
                });
            });
        });
    });
});

function getServiceStudent(lastUpdate: number): StudentConfigStorage {
    const yearStart = moment('2022-09-01');
    const yearEnd = moment('2023-06-20');
    const yearLength = yearEnd.diff(yearStart, 'days');

    return {
        lastServiceUpdate: lastUpdate,
        futureExclusions: [],
        schoolYear: {
            beginning: '09-01',
            end: '06-20',
            days: yearLength,
        }
    } as any
}