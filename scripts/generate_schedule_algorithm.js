"use strict";

let sqlite3 = require('sqlite3').verbose();
let async = require('async');
let util = require('util');
let Heap = require('heap');

let db = new sqlite3.Database('scheduleme.db');

/*
 * This variable exemplifies the format of the input to the
 * scheduling algorithm.
 */
let sample_input = {
    'class_groups': [
        {
            'class_group_id': 1,
            'classes': [
                611, // CS 3312 Project Implementation
            ]
        },
        {
            'class_group_id': 2,
            'classes': [
                1313, // LMC 3431 Tech Comm Approaches
            ]
        },
        {
            'class_group_id': 3,
            'classes': [
                623, // CS 4235 Intro to Info Security
                625, // CS 4261 Mobile Apps and Services
                628, // CS 4420 Database Systems Implementation
            ]
        },
        {
            'class_group_id': 4,
            'classes': [
                607, // CS 3210 Design of Operating Systems
            ]
        },
        {
            'class_group_id': 5,
            'classes': [
                619, // CS 4001 Computing & Society
                620, // CS 4002 Robots & Society
            ]
        },
        {
            'class_group_id': 6,
            'classes': [
                654, // CS 6241 Compiler Design
            ]
        }
    ],
    'locked_class_groups': [
        1, 2, 3, 4, 5
    ],
    'locked_sections': [
        28749, 28736
    ],
    'criteria': [
        {
            'type': 'credits',
            'parameters': [ 12, 12 ],
            'priority': 'required'
        },
        {
            'type': 'timeslot',
            'parameters': { 'day_of_week': 'M', 'start_time': '14:05', 'end_time': '14:55' },
            'priority': 'required'
        },
        {
            'type': 'timeofday',
            'parameters': { 'start_time': '11:35', 'end_time': '17:55' },
            'priority': 'medium'
        },
        {
            // IF there is a gap, how long?
            'type': 'timebetween',
            // at_least x, no_more_than x
            'parameters': { 'condition': 'at_least',  'value': 3 },
            'priority': 'high'
        },
        {
            'type': 'avggpa',
            'parameters': 3.0,
            'priority': 'low'
        },
        // {
        //     'type': 'distance',
        //     'parameters': 10, // minutes at avg walking speed
        //     'priority': 'medium'
        // }
    ]
};

function to_map(array, key) {
    let map = new Map();
    array.forEach(function(obj) {
        map.set(obj[key], obj);
    });

    return map;
}

/*
 * retrieve class data, sections, timeslots for algorithm input
 */
function get_all_class_data(input, callback) {
    async.map(
        input.class_groups,
        function(class_group, class_group_callback) {
            async.map(
                class_group.classes,
                function(class_id, class_callback) {
                    async.waterfall([
                        function(class_data_callback) {
                            db.get(
                                'SELECT * FROM CLASS WHERE class_id = ?',
                                [ class_id ],
                                class_data_callback);
                        },
                        function(class_data, section_data_callback) {
                            db.all(
                                'SELECT * FROM SECTION LEFT OUTER JOIN PROFESSOR USING (PROFESSOR_ID) WHERE class_id = ?',
                                [ class_data.class_id ],
                                function(err, sections) {
                                    if (err != null) {
                                        section_data_callback(err, null);
                                    } else {
                                        async.map(
                                            sections,
                                            function(section, timeslot_callback) {
                                                db.all(
                                                    'SELECT * FROM TIMESLOT WHERE section_id = ?',
                                                    [ section.section_id ],
                                                    function(err, timeslots) {
                                                        if (err != null) {
                                                            timeslot_callback(err, null);
                                                        } else {
                                                            section.timeslots = timeslots;
                                                            section.packed_timeslots = create_packed_timeslots(timeslots);
                                                            timeslot_callback(null, timeslots);
                                                        }
                                                    });
                                            },
                                            function(err, sections_with_timeslots) {
                                                if (err != null) {
                                                    section_data_callback(err, null);
                                                } else {
                                                    class_data.sections = sections;
                                                    section_data_callback(null, class_data);
                                                }
                                            });
                                    }
                                });
                        }],
                        class_callback);
                },
                function(err, classes) {
                    if (err != null) {
                        class_group_callback(err, null);
                    } else {
                        class_group_callback(null, {
                            'class_group_id': class_group.class_group_id,
                            'classes': classes
                        });
                    }
                });
        },
        callback);
}

/*
 * Assigns a numerical value to each day of the week.
 */
let days_map = new Map([
    [ 'M', 0 ],
    [ 'T', 1 ],
    [ 'W', 2 ],
    [ 'R', 3 ],
    [ 'F', 4 ],
    [ 'S', 5 ],
    [ 'U', 6 ]
]);

/*
 * Stores the half-hour adjustment given the minute part of the time, when
 * computing time slots.
 */
let time_adjust_map = {
    // start minutes
    '05': +0,
    '35': +1,

    // end minutes
    '25': +0,
    '55': +1
};

/*
 * Takes a "HH:MM" format string
 * Expects HH to be 24-hour time
 * Expects MM to be 05, 25, 25, or 55
 * Must be between 00:05 and 23:55
 * 00:05 => 0, 23:35 => 47
 * 00:25 => 0, 23:55 => 47
 */
function time_to_slot_num(time) {
    let base = Number.parseInt(time.substring(0, 2), 10) * 2;
    let off = time_adjust_map[time.substring(3, 5)];
    console.assert(!Number.isNaN(base + off), 'bad time_to_slot %s', time);
    return base + off;
}

function time_to_slot_num_lenient(time) {
    let base = Number.parseInt(time.substring(0, 2), 10) * 2;
    let min = Number.parseInt(time.substring(3, 5), 10);
    let off = Math.round(min / 60);

    return base + off;
}

/*
 * 1's in range [start, end] (inclusive!!)
 * bit_range(2, 4) => 00000000 00000000 00000000 00011100
 */
function bit_range(start, end) {
    console.assert(start >= 0 && start < 32, 'start %s out of range', start);
    console.assert(end >= 0 && end < 32, 'end %s out of range', end);

    let len = end - start + 1;
    return ((1 << len) - 1) << start;
}

function create_packed_timeslots(timeslots) {
    // need two ints for each day since we have a theoretical max
    // of 48 time slots/day and js can't do 64bit bitwise ops
    //    
    //    v 31                              v 0
    // 0: 00000000 00000000 00000000 00000000
    //                      v 47            v 32
    // 1: xxxxxxxx xxxxxxxx 00000000 00000000
    let arr = new Uint32Array(14);
    timeslots.forEach(function(timeslot) {
        console.assert(timeslot.start_time !== undefined, "undef " + util.inspect(timeslot));
        let idx = 2 * days_map.get(timeslot.day_of_week);
        let start_slot = time_to_slot_num_lenient(timeslot.start_time)
        let end_slot = time_to_slot_num_lenient(timeslot.end_time);
        if (start_slot > 31) {
            // entirely in upper slots
            arr[idx + 1] |= bit_range(start_slot - 32, end_slot - 32);
        } else if (end_slot < 32) {
            // entirely in lower slots
            arr[idx] |= bit_range(start_slot, end_slot);
        } else {
            // crosses int boundary
            arr[idx] |= bit_range(start_slot, 31);
            arr[idx + 1] |= bit_range(0, end_slot - 32);
        }
    });

    return arr;
}

function to_padded_bin(num) {
    if (num < 0) {
        num += 0x100000000;
    }

    return ('0000000000000000000000000000000' + num.toString(2)).substr(-32);
}

function print_packed_timeslots(pts) {
    let timeslots = new Array();
    for (let entry of days_map) {
        let day = entry[0];
        let idx = entry[1] * 2;

        let lo = pts[idx];
        let hi = pts[idx + 1];

        console.log(day + ': ' + to_padded_bin(hi) + to_padded_bin(lo));
    }
}

/*
 * Determines whether two packed timeslots conflict.
 */
function do_packed_timeslots_conflict(pt1, pt2) {
    for (let i = 0; i < 14; i++) {
        if ((pt1[i] & pt2[i]) != 0)  {
            return true;
        }
    }

    return false;
}

/*
 * Takes a list of class groups and returns a map of section id to
 * class group, class, and section.
 */
function create_section_map(class_groups) {
    let map = new Map();
    class_groups.forEach(function(class_group) {
        class_group.classes.forEach(function(clazz) {
            clazz.sections.forEach(function(section) {
                map.set(section.section_id, { 'class_group': class_group, 'class': clazz, 'section': section });
            });
        });
    });

    return map;
}

/*
 * Creates a set of timeslots for every day of the week,
 * between start_time and end_time
 */
function create_daily_range_timeslots(start_time, end_time) {
    let timeslots = new Array();
    for (let day of days_map.keys()) {
        timeslots.push({
            'day_of_week': day,
            'start_time': start_time,
            'end_time': end_time
        });
    }

    return timeslots;
}

/*
 * Inverts the time ranges specified by a packed timeslots.
 */
function invert_packed_timeslots(pts) {
    let arr = new Uint32Array(14);
    for (let i = 0; i < 14; i += 2) {
        arr[i] = pts[i] ^ 0xFFFFFFFF;
        arr[i + 1] = pts[i + 1] ^ 0x0000FFFF;
    }

    return arr;
}

/*
 * Merges two packed timeslots objects.
 */
function merge_packed_timeslots(pts1, pts2) {
    let arr = new Uint32Array(14);
    for (let i = 0; i < 14; i++) {
        arr[i] = pts1[i] | pts2[i];
    }

    return arr;
}

/*
 * Returns the weight that should be given to a satisfied criterion according
 * to its priority, on the scale [0, 1.0].
 */
function get_priority_weight(criterion) {
    switch (criterion.priority) {
        case 'required': throw 'don\'t weight required criteria';
        // TODO: linear or geometric-ish scale?
        case 'high':   return 1.0;
        case 'medium': return 0.6;
        case 'low':    return 0.3;
        default: throw 'invalid priority ' + pri;
    }
}

/*
 * Types of criteria:
 *
 * |---------------+-------------+-----------|
 * |               | Global      | Local     |
 * |---------------+-------------+-----------|
 * | Required      | credits     | timeslot  |
 * |---------------+-------------+-----------|
 * | Prioritizable | timebetween | timeofday |
 * |               | distance    | avggpa    |
 * |---------------+-------------+-----------|
 *
 * Local criteria are applicable to specific class sections.
 * Global criteria are only applicable to a schedule as a whole.
 *
 * Required criteria may only have their priority set as 'required'.
 * Prioritizable criteria may have 'low', 'medium', 'high', or 'required' priority.
 *
 */
function is_local_criterion(criterion) {
    switch (criterion.type) {
        case 'credits':
        case 'timebetween':
        case 'distance':
            return false;
        case 'timeslot':
        case 'timeofday':
        case 'avggpa':
            return true;
        default:
            throw 'invalid criterion type ' + criterion.type;
    }
}

/*
 * Calculates criteria weights for individual sections.
 * Returns a score for the section, or -1 if section should be disqualified.
 */
function calculate_local_criteria_weight(section, criteria) {
    let total_score = 0;
    let count = 0;

    for (let criterion of criteria) {
        if (!is_local_criterion(criterion)) continue;

        count += 1;
        let satisfies = satisfies_local_criterion(section, criterion);
        if (criterion.priority === 'required') {
            if (!satisfies) {
                return -1;
            }
        } else if (satisfies) {
            // TODO: combine scores differently than by summation?
            total_score += get_priority_weight(criterion);
        }
    }

    if (count === 0) return 0;

    let final_score = total_score / count;
    console.assert(!Number.isNaN(total_score));
    console.assert(!Number.isNaN(final_score));

    return final_score;
}

/*
 * Returns whether the given section satisfies the given criterion.
 * Should only be called with locally-weightable criteria.
 */
function satisfies_local_criterion(section, criterion) {
    switch (criterion.type) {
        case 'timeslot':
            if (!criterion.hasOwnProperty('packed_timeslots')) {
                criterion.packed_timeslots = create_packed_timeslots([criterion.parameters]);
            }

            return !do_packed_timeslots_conflict(criterion.packed_timeslots, section.packed_timeslots);
        case 'timeofday':
            if (!criterion.hasOwnProperty('packed_timeslots')) {
                let daily_range = create_daily_range_timeslots(
                    criterion.parameters.start_time,
                    criterion.parameters.end_time);
                let daily_packed = create_packed_timeslots(daily_range);
                criterion.packed_timeslots = invert_packed_timeslots(daily_packed);
            }

            return !do_packed_timeslots_conflict(criterion.packed_timeslots, section.packed_timeslots);
        case 'avggpa':
            if (section.avg_gpa == null) return true;
            return section.avg_gpa >= criterion.parameters
        default:
            throw 'criterion does not exist: ' + criterion.type;
    }
}

/*
 * Returns the weight of the given schedule with respect to the global
 * criteria in the criteria list provided (does not need to be filtered
 * beforehand). This is the average of weights of the individual global
 * criteria. Returns -1 if the schedule fails to satisfy a required
 * criterion, or some non-negative number representing the weight.
 */
function calculate_global_criteria_weight(schedule, criteria) {
    let total_score = 0;
    let count = 0;

    for (let criterion of criteria) {
        if (is_local_criterion(criterion)) continue;
        // credits is special
        if (criterion.type === 'credits') continue;

        count += 1;
        let score = calculate_global_criterion_weight(schedule, criterion);
        if (criterion.priority === 'required') {
            if (score === -1) {
                return -1;
            }
        } else {
            // TODO: combine scores differently than by summation?
            total_score += get_priority_weight(criterion) * score;
        }
    }

    if (count === 0) return 0;
    let final_score = total_score / count;
    console.assert(!Number.isNaN(total_score));
    console.assert(!Number.isNaN(final_score));

    return final_score;
}

/*
 * Returns the weight of a schedule with respect to the given global
 * criterion.
 */
function calculate_global_criterion_weight(schedule, criterion) {
    switch (criterion.type) {
        case 'timebetween':
            return calculate_timebetween_weight(schedule, criterion);
        case 'distance':
            // TODO: gtplaces data
            return 0;
        default:
            throw 'criterion does not exist: ' + criterion.type;
    }
}

/*
 * Given array of packed timeslots, determines whether a class occupies
 * the given timeslot on the given day.
 */
function is_timeslot_occupied(packed_timeslots, day, slot) {
    console.assert(0 <= day && day <= 7, 'invalid day number ' + day);
    console.assert(0 <= slot && slot < 48, 'invalid slot number ' + slot);

    if (slot < 32) {
        return (packed_timeslots[2 * day] & (1 << slot)) != 0;
    } else {
        return (packed_timeslots[2 * day + 1] & (1 << (slot - 32))) != 0;
    }
}

/*
 * Calulates a weight for a schedule as a function of the gaps between classes,
 * using the formula:
 *
 * Product over non-acceptable gaps of:
 *    1 - 0.1 * (absolute difference in slots of gap vs. acceptable cutoff)
 *
 * Further user studies would be needed to determine whether anyone actually
 * wants to distinguish between the quantity and length of gaps.
 *
 * Another factor that would need to be considered in the future would be to
 * exclude scheduled exam periods (and possibly labs) from this calcluation.
 */
function calculate_timebetween_weight(schedule, timebetween) {
    console.assert(timebetween.type === 'timebetween');

    let timeslots = schedule.packed_timeslots;
    let is_acceptable_gap = get_timebetween_satisfies_function(timebetween);

    // in half hours
    let gap_lengths = [];

    for (let day = 0; day < 7; day++) {

        let before_class_start = true;
        let in_gap = false;
        let current_gap = 0;

        for (let slot = 0; slot < 48; slot++) {
            let occupied = is_timeslot_occupied(timeslots, day, slot);
            if (occupied) {
                if (in_gap) {
                    gap_lengths.push(current_gap);
                    in_gap = false;
                    current_gap = 0;
                }

                if (before_class_start) {
                    before_class_start = false;
                }
            } else {
                if (!before_class_start) {
                    if (!in_gap) {
                        in_gap = true;
                    }

                    current_gap += 1;
                }
            }
        }
    }

    let good_length = timebetween.parameters.value * 2;
    let length_factor = 1;
    for (let i = 0; i < gap_lengths.length; i++) {
        if (!is_acceptable_gap(gap_lengths[i])) {
            if (timebetween.priority === 'required') return -1
            let difference = Math.abs(good_length - gap_lengths[i]);
            length_factor *= Math.max(0, 1 - difference * 0.1);
        }
    }

    return length_factor;
}

/*
 * Returns a function for the given timebetween that takes a gap length
 * (in half hours) and returns a boolean value indicating whether that gap
 * length satisfies the timebetween criterion.
 */
function get_timebetween_satisfies_function(timebetween) {
    switch (timebetween.parameters.condition) {
        case 'at_least':
            // 'gap' is in timeslots (half hours), but timebetween value is in hours
            return function(gap) {
                return gap >= 2 * timebetween.parameters.value;
            };
        case 'no_more_than':
            return function(gap) {
                return gap <= 2 * timebetween.parameters.value;
            };
        default:
            throw 'invalid timebetween condition ' + timebetween.parameters.condition;
    }
}

/*
 * Calculates the final score of a schedule, based on the global schedule score
 * and the indvidual scores of the sections in the schedule (as aggregated in
 * find_schedules_in_credit_range). An average between the global score and the
 * average section score (subject to change).
 */
function calculate_total_schedule_score(schedule, criteria) {
    let global = 0;
    if (schedule.hasOwnProperty('global')) {
        global = schedule.global;
    } else {
        global = schedule.global = calculate_global_criteria_weight(schedule, criteria);
    }

    let local = schedule.score / schedule.sections.length;

    // dividing by two is unnecessary but yields a nice normalized value
    return (global + local) / 2;
}

/*
 * Given a selection of classes and criteria, in the structure exemplified
 * in the sample_input variable above, and a count, provides the given callback
 * with a list of the `count` best schedules that can be made of the sections
 * provided, with respect to the given criteria and locks.
 */
function find_best_schedules(input, count, callback) {
    get_all_class_data(input,
        function(err, class_groups) {
            if (err != null) {
                callback(err, null);
                return;
            } else try {
                let locked_class_group_set = new Set(sample_input.locked_class_groups);
                let locked_sections_set = new Set(sample_input.locked_sections);
                let section_map = create_section_map(class_groups);

                let credits = input.criteria.filter(function(criterion) { return criterion.type === 'credits'; })[0].parameters;

                // Assign individual section weights and filter sections that
                // violate required criteria
                for (let entry of section_map) {
                    let section_id = entry[0];
                    let val = entry[1];
                    let weight = calculate_local_criteria_weight(val.section, input.criteria);
                    if (weight === -1) {
                        section_map.delete(section_id);
                    } else {
                        // TODO: rename weight to score
                        section_map.get(section_id).score = weight;
                    }
                }

                let locked_class_groups = [];
                let unlocked_class_groups = [];

                class_groups.forEach(function(class_group) {
                    if (locked_class_group_set.has(class_group.class_group_id)) {
                        locked_class_groups.push(class_group);
                    } else {
                        unlocked_class_groups.push(class_group);
                    }
                });

                let section_buckets = [];
                let lock_count = 0;

                // section_buckets is an array of arrays
                // each sub-array represents a set of mutually exclusive sections
                // the first lock_count groups are groups from which a section
                // must be included in all schedules
                for (let class_group of class_groups) {
                    let all_sections = class_group.classes
                        .map(function(clazz) { return clazz.sections; })
                        .reduce(function(acc, sections) { return acc.concat(sections); })
                        .filter(function(section) {
                            if (!section_map.has(section.section_id)) return false;
                            section.score = section_map.get(section.section_id).score;
                            return true;
                        });

                    let locked_sections = all_sections.filter(function(section) {
                        return locked_sections_set.has(section.section_id);
                    });

                    if (locked_class_group_set.has(class_group.class_group_id) && locked_sections.length > 0) {
                        callback('Cannot lock both class and section', null);
                        return;
                    }
                    if (locked_sections.length > 1) {
                        callback('Conflicting locked sections: ' + locked_sections.join(', '), null);
                        return;
                    }

                    if (locked_sections.length > 0) {
                        section_buckets.unshift(locked_sections);
                        lock_count++;
                        continue;
                    }

                    if (locked_class_group_set.has(class_group.class_group_id)) {
                        section_buckets.unshift(all_sections);
                        lock_count++;
                    } else {
                        section_buckets.push(all_sections);
                    }
                }

                let all_schedules = find_schedules_within_credit_range(
                        section_buckets, lock_count, 0,
                        new Uint32Array(14), credits[0], credits[1]);

                let sched_heap = new Heap(function(a, b) {
                    // min heap, so we can pop lowest score to insert higher scores
                    return a.total_score - b.total_score;
                });

                for (let schedule of all_schedules) {
                    schedule.total_score = calculate_total_schedule_score(schedule, input.criteria);
                    sched_heap.push(schedule);
                    if (sched_heap.size() > count) sched_heap.pop();
                }

                let top_n = sched_heap.toArray().reverse();

                let section_ids = top_n.map(function(sched) { return sched.sections.map(function(sec) { return sec.section_id; }); });

                callback(null, section_ids);
            } catch (e) {
                throw e;
                callback(e, null);
            }
        });
}

/*
 * Given a list of lists of sections section_buckets, finds a set of
 * non-time-conflicting sections within the given range of credit hours.
 * Groups of sections that are locked - i.e., must always be chosen - are
 * expected to appear at the front of the list of buckets, and the count
 * of these is to be specified by lock_count.
 *
 * Also keeps track of the total score of all the sections in each
 * generated schedule.
 *
 * This function is a generator, so it returns an iterator over the
 * different schedules it finds.
 */
function* find_schedules_within_credit_range(section_buckets, lock_count, start_ind, packed_timeslots, credit_min, credit_max) {
    if (start_ind == section_buckets.length
            || credit_max <= 0) {
        yield {
            'credits': 0,
            'score': 0,
            'sections': [],
            'packed_timeslots': packed_timeslots
        };
        return;
    }

    // Not locked so search schedules without current section(s)
    if (lock_count <= 0) {
        let with_skip = find_schedules_within_credit_range(
                section_buckets, lock_count - 1, start_ind + 1,
                packed_timeslots, credit_min, credit_max);
        for (let schedule of with_skip) {
            yield schedule;
        }
    }

    // search schedules including current section
    for (let section of section_buckets[start_ind]) {
        if (section.credits > credit_max) continue;
        if (do_packed_timeslots_conflict(packed_timeslots, section.packed_timeslots)) continue;

        let merged_timeslots = merge_packed_timeslots(packed_timeslots, section.packed_timeslots);

        let with_take = find_schedules_within_credit_range(
                section_buckets, lock_count - 1, start_ind + 1,
                merged_timeslots,
                credit_min - section.credits, credit_max - section.credits);
        for (let schedule of with_take) {
            let total_credits = schedule.credits + section.credits;
            // TODO: better combining function than +?
            let total_score = schedule.score + section.score;
            if (total_credits >= credit_min && total_credits <= credit_max) {
                yield {
                    'credits': total_credits,
                    'score': total_score,
                    'sections': [section].concat(schedule.sections),
                    'packed_timeslots': schedule.packed_timeslots
                };
            }
        }
    }
}

/*
 * Runs the scheduling algorithm on sample_input. Comment out when not
 * testing so it doesn't get executed within the application.
 */
// find_best_schedules(sample_input, 5, function(err, schedules) {
//     if (err != null) {
//         console.dir(err, { depth: null, colors: true });
//     } else {
//         //console.log(JSON.stringify(schedules, null, 2));
//         console.dir(schedules, { depth: null, colors: true });
//     }
// });

module.exports.find_best_schedules = find_best_schedules;
