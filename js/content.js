import { score, challengeScore, packScore } from './config.js';
import { round } from './util.js';

/**
 * Path to directory containing `_list.json` and all levels
 */
const dir = '/data';
/**
 * Symbol, that marks a level as not part of the list
 */
const benchmarker = '_';

export async function fetchList() {
    const listResult = await fetch(`${dir}/_list.json`);
    const packResult = await fetch(`${dir}/_packs.json`);
    try {
        const list = await listResult.json();
        const packsMap = await packResult.json();

        // Create a lookup dictionary for ranks
        const ranksEntries = list.filter((path) => !path.startsWith(benchmarker)).map((
            path,
            index,
        ) => [path, index + 1]);
        const ranks = Object.fromEntries(ranksEntries);

        return await Promise.all(
            list.map(async (path) => {
                let packs = []
                const rank = ranks[path] || null;
                try {
                    const levelResult = await fetch(
                        `${dir}/${path.startsWith(benchmarker) ? path.substring(1) : path}.json`,
                    );
                    let level = await levelResult.json(); // no longer a constant so we can wrap in the path

                    level["path"] = path;

                    
                    packsMap.forEach((pack) => {
                        try {
                            if (pack.levels) { 
                                if (pack.levels.includes(path)) {
                                    packs.push(pack);
                                    
                                }

                                // checks if the pack contains the level's path
                                for (let packlevel in pack.levels) { 
                                    if (pack.levels[packlevel] === path) {
                                        // iterate through every level in the pack,
                                        // and overwrite the level path in the levels array
                                        // with the object it resolves to
                                        pack.levels[packlevel] = level;
                                        pack.levels[packlevel].path = path;
                                        pack.levels[packlevel].rank = rank;
                                        
                                    }
                                }
                            } else if (pack.difficulty === level.difficulty) {
                                packs.push(pack);
                            }
                        } catch (e) {
                            console.error(`failed to fetch pack ${pack.name}:  ${e}`)
                        }
                    })
                    
                    
                    
                    return [
                        null,
                        rank,
                        {
                            ...level,
                            rank,
                            path,
                            packs,
                            records: level.records.sort(
                                (a, b) => b.percent - a.percent,
                            ),
                        },
                    ];
                } catch {
                    console.error(`Failed to load level #${rank} ${path}.`);
                    return [path, rank, null];
                }
            }),
        );
    } catch {
        console.error(`Failed to load list.`);
        return null;
    }
}

export async function fetchChallengeList() {
    const challengeListResult = await fetch(`${dir}/_challengeList.json`);
    try {
        const challengeList = await challengeListResult.json();

        // Create a lookup dictionary for ranks
        const ranksEntries = challengeList.filter((path) => !path.startsWith(benchmarker)).map((
            path,
            index,
        ) => [path, index + 1]);
        const ranks = Object.fromEntries(ranksEntries);

        return await Promise.all(
            challengeList.map(async (path) => {
                const rank = ranks[path] || null;
                try {
                    const levelResult = await fetch(
                        `${dir}/${path.startsWith(benchmarker) ? path.substring(1) : path}.json`,
                    );
                    const level = await levelResult.json();
                    return [
                        null,
                        rank,
                        {
                            ...level,
                            rank,
                            path,
                            records: level.records.sort(
                                (a, b) => b.percent - a.percent,
                            ),
                        },
                    ];
                } catch {
                    console.error(`Failed to load level #${rank} ${path}.`);
                    return [path, rank, null];
                }
            }),
        );
    } catch {
        console.error(`Failed to load challenge list.`);
        return null;
    }
}

export async function fetchEditors() {
    try {
        const editorsResults = await fetch(`${dir}/_editors.json`);
        const editors = await editorsResults.json();
        return editors;
    } catch {
        return null;
    }
}

export async function fetchPacks(list) {
    const packResult = await fetch(`${dir}/_packs.json`);

    const packs = await packResult.json();


    
    list.forEach((object) => {

        // list is an array > array with length of 3 > null unless something is broken, level rank, level object
        let level = object[2];
         
        packs.forEach(async (pack) => {
            try {
                if (pack.levels) { 
                    // checks if the pack contains the level's path
                    for (let packlevel in pack.levels) { 
                        if (pack.levels[packlevel] === level.path) {
                            // iterate through every level in the pack,
                            // and overwrite the level path in the levels array
                            // with the object it resolves to
                            pack.levels[packlevel] = level;
                            pack.levels[packlevel].path = level.path;
                            pack.levels[packlevel].rank = level.rank;
                            
                        }
                    }
                }
            } catch (e) {
                console.error(`failed to fetch pack ${pack.name}:  ${e}`)
            }
        })
    });
    

    
    packs.sort(
        (a, b) => b.difficulty - a.difficulty,
    );

    return packs;
}

export async function fetchPackRecords(packs, list) {
    
    // list is needed for threshold packs because we need to access the level objects
    let users = []
    let completedPacksMap = {};

    // Collect records and users
    list.forEach(([_, __, level]) =>  {
        if (level.records) {
            level.records.forEach((record) => {
                const exists = users.find((user) => record.user.toLowerCase() === user.toLowerCase() || level.verifier.toLowerCase() === user.toLowerCase())
                if (!exists) users.push(record.user)
            })
        }
    })

    // Process each user and pack
    users.forEach((user) => { 
        let userLower = user.toLowerCase();
        
        packs.forEach((pack) => {
            completedPacksMap[pack.name] ??= new Set();

            if (pack.levels) {
                // Check if user has completed all levels in the pack
                const allCompleted = pack.levels.every((packLevel) => {
                    return packLevel.records?.some((record) => 
                        record.user.toLowerCase() === userLower || 
                        packLevel.verifier?.toLowerCase() === userLower
                    );
                });

                if (allCompleted) {
                    completedPacksMap[pack.name].add(user);
                }
            } else {
                // Check levels by difficulty
                let levelsInDifficulty = list.filter(([_, __, lvl]) => lvl.difficulty === pack.difficulty && lvl.id !== 0);

                const completedLevels = levelsInDifficulty.filter(([_, __, level]) => 
                    level.records.some((record) => 
                        record.user.toLowerCase() === userLower && 
                        record.percent === 100
                    )
                );

                // If user has completed at least 5 levels in this difficulty
                if (completedLevels.length >= 5) {
                    completedPacksMap[pack.name].add(user);
                }
            }
        });
    });

    return completedPacksMap;


}

export async function fetchLeaderboard(list) {
    const packs = await fetchPacks(list);

    const scoreMap = {};
    const errs = [];
    let possibleMax = 0;

    const completedPacksMap = {};

    if (list === null) {
        return [null, ['Failed to load list.']];
    }

    list.forEach(([err, rank, level]) => {
        if (err) {
            errs.push(err);
            return;
        }

        if (rank === null) {
            return;
        }

        // Author
        const author = Object.keys(scoreMap).find(
            (u) => u.toLowerCase() === level.author.toLowerCase(),
        ) || level.author;
        scoreMap[author] ??= {
            created: [],
            verified: [],
            completed: [],
            progressed: [],
            userPacks: [],
        };

        completedPacksMap[author] ??= new Set();

        const { created } = scoreMap[author];
        created.push({
            rank,
            level: level.name,
            link: level.verification,
        });

        // Creators
        level.creators.forEach((person) => {
            const creator = Object.keys(scoreMap).find(
                (u) => u.toLowerCase() === person.toLowerCase(),
            ) || person;
            scoreMap[creator] ??= {
                created: [],
                verified: [],
                completed: [],
                progressed: [],
                userPacks: [],
            };
            const { created } = scoreMap[creator];
            created.push({
            rank,
            level: level.name,
            link: level.verification,
            });
        });
        
        // Verification
        const verifier = Object.keys(scoreMap).find(
            (u) => u.toLowerCase() === level.verifier.toLowerCase(),
        ) || level.verifier;
        scoreMap[verifier] ??= {
            created: [],
            verified: [],
            completed: [],
            progressed: [],
            userPacks: [],
        };
        completedPacksMap[verifier] ??= new Set();

        let verifiedScore = score(rank, level.difficulty, 100, level.percentToQualify, list)

        // check if user has verified all levels in pack
        if (level.packs.length > 0) {
            level.packs.forEach((pack) => {
                if (Array.isArray(pack.levels)) {
                    const allVerified = pack.levels.every((packLevel) =>
                        list.some(([_, __, lvl]) =>
                            lvl.path == packLevel.path &&
                            lvl.verifier.toLowerCase() === verifier.toLowerCase() // check if same verifier for each lvl
                        )
                    );
                    if (allVerified) {
                        completedPacksMap[verifier].add(pack);
                    }
                } else if (pack.difficulty === level.difficulty) {
                    // Count levels completed by the user in the current difficulty
                    const completedInDifficulty = list.filter(([_, __, lvl]) =>
                        lvl.difficulty === level.difficulty && 
                        lvl.verifier.toLowerCase() === verifier.toLowerCase()
                    )
                    .length;

                    // Check if the user has completed as many levels as the pack's threshold
                    if (completedInDifficulty >= 5) {
                        completedPacksMap[verifier].add(pack);
                    }
                }
            })
        }

        const { verified } = scoreMap[verifier];
        verified.push({
            rank,
            level: level.name,
            score: score(rank, level.difficulty, 100, level.percentToQualify, list),
            link: level.verification,
        });

        
        
        // sneaky lil FAKEOUT completed object, 
        // used to show verifications under the "completed" section
        const { completed } = scoreMap[verifier];
        completed.push({
            rank,
            level: level.name,
            score: score(rank, level.difficulty, 100, level.percentToQualify, list),
            link: level.verification,
            rating: level.enjoyment,
        });

        // Records
        level.records.forEach((record) => {
            const user = Object.keys(scoreMap).find(
                (u) => u.toLowerCase() === record.user.toLowerCase(),
            ) || record.user;
            scoreMap[user] ??= {
                created: [],
                verified: [],
                completed: [],
                progressed: [],
                userPacks: [] 
            };
            
            completedPacksMap[user] ??= new Set();

            const { completed, progressed } = scoreMap[user];

            let progressedScore = 0;
            let completedScore = 0;

            if (record.percent === 100) {

                completedScore += score(rank, level.difficulty, 100, level.percentToQualify, list);
                

                // check if user has completed all levels in a pack
                if (level.packs.length > 0) {
                    level.packs.forEach((pack) => {
                        if (Array.isArray(pack.levels)) {
                            
                            const allCompleted = pack.levels.every((packLevel) =>
                                list.some(([_, __, lvl]) =>
                                    lvl.path == packLevel.path &&
                                    lvl.records.some((r) => r.user === record.user && r.percent === 100)
                                )
                            );
                            if (allCompleted) {
                                completedPacksMap[user].add(pack);
                            }
                        } else if (pack.difficulty === level.difficulty) {
                            // Count levels completed by the user in the current difficulty
                            const completedInDifficulty = list.filter(([_, __, lvl]) =>
                                lvl.difficulty === level.difficulty && 
                                lvl.records.some((r) => r.user === record.user && r.percent === 100) || lvl.verifier.toLowerCase() === user.toLowerCase()
                            )
                            .length;

                            // Check if the user has completed as many levels as the pack's threshold
                            if (completedInDifficulty >= 5) {
                                completedPacksMap[user].add(pack);
                                

                            } 
                        }
                        // completedScore += packScore(pack, list);
                    });
                }
                completed.push({
                    rank,
                    level: level.name,
                    score: completedScore,
                    link: record.link,
                    rating: record.enjoyment,
                });
                

                return;
            }
            
            progressedScore += score(rank, level.difficulty, record.percent, level.percentToQualify, list)
            progressed.push({

                rank,
                level: level.name,
                percent: record.percent,
                score: progressedScore,
                link: record.link,
                rating: record.enjoyment,
            });

            

            
        });

        possibleMax += score(rank, level.difficulty, 100, level.percentToQualify, list);
    })


    packs.forEach((pack) => possibleMax += packScore(pack, list));

    Object.entries(completedPacksMap).forEach(([user, packs]) => {
        const uniquePacks = Array.from(packs);
        scoreMap[user].userPacks.push(...uniquePacks);
    });
    
    // Wrap in extra Object containing the user and total score

    const res = Object.entries(scoreMap).map(([user, scores]) => {
        const { created, verified, completed, progressed} = scores;


        let total = [completed, progressed]
            .flat()
            .reduce((prev, cur) => prev + cur.score, 0);

        scores.userPacks.forEach((pack) => total += packScore(pack, list)) 

        return {
            user,
            total: round(total),
            possibleMax,
            userPacks: scores.userPacks,
            ...scores,
        };
    });

    // Sort by total score
    return [res.sort((a, b) => b.total - a.total), errs];
    
}


export async function fetchChallengeLeaderboard() {
    const list = await fetchChallengeList();

    const scoreMap = {};
    const errs = [];
    let possibleMax = 0;

    if (list === null) {
        return [null, ['Failed to load list.']];
    }

    list.forEach(([err, rank, level]) => {
        if (err) {
            errs.push(err);
            return;
        }

        if (rank === null) {
            return;
        }

        possibleMax += challengeScore(level.difficulty);

        // Verification
        const verifier = Object.keys(scoreMap).find(
            (u) => u.toLowerCase() === level.verifier.toLowerCase(),
        ) || level.verifier;
        scoreMap[verifier] ??= {
            verified: [],
            completed: [],
            progressed: [],
        };
        const { verified } = scoreMap[verifier];
        verified.push({
            rank,
            level: level.name,
            score: challengeScore(level.difficulty),
            link: level.verification,
        });

        // Records
        level.records.forEach((record) => {
            const user = Object.keys(scoreMap).find(
                (u) => u.toLowerCase() === record.user.toLowerCase(),
            ) || record.user;
            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
            };
            const { completed, progressed } = scoreMap[user];
            if (record.percent === 100) {
                completed.push({
                    rank,
                    level: level.name,
                    score: challengeScore(level.difficulty),
                    link: record.link,
                });
                return;
            }

            progressed.push({
                rank,
                level: level.name,
                percent: record.percent,
                score: challengeScore(level.difficulty),
                link: record.link,
            });
        });
    });

    // Wrap in extra Object containing the user and total score
    const res = Object.entries(scoreMap).map(([user, scores]) => {
        const { verified, completed, progressed } = scores;
        const total = [verified, completed, progressed]
            .flat()
            .reduce((prev, cur) => prev + cur.score, 0);

        return {
            user,
            total: round(total),
            possibleMax,
            ...scores,
        };
    });

    // Sort by total score
    return [res.sort((a, b) => b.total - a.total), errs];
}



export function fetchTierLength(list, difficulty) {
    let tierLength = 0;
    list.forEach(([err, rank, level]) => {
        if (err) {
            return;
        }
        if (rank === null) {
            return;
        }

        if (level.difficulty === difficulty) {
            tierLength += 1;
        }
    });

    return tierLength;
}

export function fetchTierMinimum(list, difficulty) {
    let tierMin = 0;
    list.forEach(([err, rank, level]) => {
        if (err) {
            return;
        }
        if (rank === null) {
            return;
        }

        if (level.difficulty === difficulty) {
            tierMin = Math.max(rank, tierMin);
        }
    });
    
    return tierMin;
}

export function averageEnjoyment(records) {
    if (!records || records.length === 0) return '?'; // handle empty records

    let validRecordsCount = 0;
    const total = records.reduce((sum, record) => {
        
        if (!isNaN(record.enjoyment) && record.percent === 100) {
            validRecordsCount++;
            return sum + parseFloat(record.enjoyment);
        }
        return sum;
    }, 0);

    if (validRecordsCount === 0) return '?'; // handle case with no valid enjoyment values

    const average = total / validRecordsCount;
    return round(average, 3);
}