import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NLS_RACE_DATES: Record<string, string> = {
  NLS1: '2025-03-22',
  NLS2: '2025-04-26',
  NLS3: '2025-05-10',
  NLS4: '2025-05-24',
  NLS5: '2025-05-25',
  NLS6: '2025-08-16',
  NLS7: '2025-09-13',
  NLS8: '2025-09-14',
  NLS9: '2025-09-27',
  NLS10: '2025-10-11',
  'NLS-LIGHT': '2025-07-05'
};

const QUALI_START_HOUR = 9;
const RACE_START_HOUR = 12;

function normalizeNlsKey(name: string): string | null {
  if (/\bNLS\s*-?\s*LIGHT\b/i.test(name)) {
    return 'NLS-LIGHT';
  }

  const match = name.match(/\bNLS\s*(\d+)\b/i);
  if (match) {
    return `NLS${parseInt(match[1], 10)}`;
  }

  return null;
}

function buildSessionDate(nlsKey: string, type: 'QUALI' | 'RACE'): Date | null {
  const raceDate = NLS_RACE_DATES[nlsKey];
  if (!raceDate) {
    return null;
  }

  const baseDate = new Date(`${raceDate}T00:00:00`);
  const date = new Date(baseDate);

  if (type === 'QUALI') {
    date.setDate(date.getDate() - 1);
    date.setHours(QUALI_START_HOUR, 0, 0, 0);
  } else {
    date.setHours(RACE_START_HOUR, 0, 0, 0);
  }

  return date;
}

interface CSVRow {
  [key: string]: string;
}

interface DriverInfo {
  firstName: string;
  lastName: string;
  nationality: string | null;
}

/**
 * Strips leading/trailing double quotes and single quotes from a value.
 * Handles patterns like: "Van Der Sanden", "'Jimmy Broadbent'", 'Sub7BTG'
 */
function cleanValue(val: string | undefined): string {
  if (!val) return '';
  let cleaned = val.trim();
  // Strip outer double quotes
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1).trim();
  } else if (cleaned.startsWith('"')) {
    cleaned = cleaned.slice(1).trim();
  } else if (cleaned.endsWith('"')) {
    cleaned = cleaned.slice(0, -1).trim();
  }
  // Strip outer single quotes
  if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

function resolveTeamName(row: CSVRow, startNumber: number): string {
  const rawTeam = cleanValue(row.BEWERBER);
  if (rawTeam && !/^\d+$/.test(rawTeam)) {
    return rawTeam;
  }

  const driver1 = getDriverInfo(row, 1);
  return `Team ${driver1.lastName} - ${startNumber}`;
}

async function findOrCreateDriver(driverInfo: DriverInfo, startNumber: number) {
  const existing = await prisma.driver.findFirst({
    where: {
      firstName: driverInfo.firstName,
      lastName: driverInfo.lastName,
      nationality: driverInfo.nationality
    }
  });

  if (existing) {
    return existing;
  }

  return prisma.driver.create({
    data: {
      startNumber,
      firstName: driverInfo.firstName,
      lastName: driverInfo.lastName,
      nationality: driverInfo.nationality
    }
  });
}

function getDriverInfo(row: CSVRow, index: number): DriverInfo {
  const idx = Math.max(1, Math.min(8, index));
  let lastName = cleanValue(row[`FAHRER${idx}_NAME`]) || 'Unknown';
  let firstName = cleanValue(row[`FAHRER${idx}_VORNAME`]) || '';
  const nationality = cleanValue(row[`FAHRER${idx}_NATION`]) || null;

  // Handle full name in the NAME field (e.g., "Jimmy Broadbent" with empty VORNAME)
  if (!firstName && lastName !== 'Unknown') {
    const parts = lastName.split(/\s+/);
    if (parts.length >= 2) {
      // First word(s) = firstName, last word = lastName
      firstName = parts.slice(0, -1).join(' ');
      lastName = parts[parts.length - 1];
    } else {
      firstName = 'Unknown';
    }
  } else if (!firstName) {
    firstName = 'Unknown';
  }

  return {
    firstName,
    lastName,
    nationality: nationality && nationality.length > 0 ? nationality : null
  };
}

function getVehicleClass(row: CSVRow): string {
  return (
    cleanValue(row.KLASSE) ||
    cleanValue(row.KLASSEKURZ) ||
    cleanValue(row.UNTERKLASSE) ||
    'Unknown'
  );
}

function parseTime(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    const minutes = parseInt(parts[0]);
    const seconds = parseFloat(parts[1]);
    return minutes * 60 + seconds;
  }
  return parseFloat(timeStr);
}

function parsePitDuration(durationStr?: string): number {
  if (!durationStr) {
    return 0;
  }

  const normalized = cleanValue(durationStr).replace(',', '.').trim();
  if (!normalized) {
    return 0;
  }

  return parseTime(normalized) || 0;
}

function parseSectorValue(val: string | undefined): number | null {
  const cleaned = cleanValue(val);
  if (!cleaned) return null;
  const num = parseFloat(cleaned.replace(',', '.'));
  return isNaN(num) ? null : num;
}

function parseCSV(filePath: string): CSVRow[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ';',
    relax_column_count: true,
    quote: false
  });
}

async function processNLSFolder(folderName: string, folderPath: string) {
  console.log(`\n📂 Processing ${folderName}...`);

  const reimportExisting = (process.env.REIMPORT_EXISTING || '').toLowerCase() === 'true';

  // Get all CSV files in this folder
  const files = fs.readdirSync(folderPath).filter((f: string) => f.toUpperCase().endsWith('.CSV'));
  
  if (files.length === 0) {
    console.log(`⏭️  No CSV files found in ${folderName}`);
    return;
  }

  // Find specific files (case-insensitive)
  const qualiResultFile = files.find((f: string) => f.toUpperCase().includes('ZEITTRAINING') && f.toUpperCase().includes('RESULT'));
  const qualiLapsFile = files.find((f: string) => f.toUpperCase().includes('ZEITTRAINING') && f.toUpperCase().includes('LAPS'));
  const qualiSectorsFile = files.find((f: string) => f.toUpperCase().includes('ZEITTRAINING') && f.toUpperCase().includes('SEKTORZEITEN'));
  
  const raceResultFile = files.find((f: string) => f.toUpperCase().includes('RENNEN') && f.toUpperCase().includes('RESULT'));
  const raceLapsFile = files.find((f: string) => f.toUpperCase().includes('RENNEN') && f.toUpperCase().includes('LAPS'));
  const raceSectorsFile = files.find((f: string) => f.toUpperCase().includes('RENNEN') && f.toUpperCase().includes('SEKTORZEITEN'));

  let qualiSession = null;
  let raceSession = null;
  let existingQualiSession = false;
  let existingRaceSession = false;

  const nlsKey = normalizeNlsKey(folderName);

  // Create sessions
  if (qualiResultFile) {
    const qualiName = `${folderName} Zeittraining`;
    const qualiDate = nlsKey ? buildSessionDate(nlsKey, 'QUALI') : null;
    qualiSession = await prisma.session.findFirst({
      where: { name: qualiName, type: 'QUALI' }
    });

    if (!qualiSession) {
      qualiSession = await prisma.session.create({
        data: {
          name: qualiName,
          type: 'QUALI',
          date: qualiDate || new Date()
        }
      });
      console.log(`✅ Created qualifying session`);
    } else {
      if (reimportExisting) {
        await prisma.result.deleteMany({ where: { sessionId: qualiSession.id } });
        await prisma.lap.deleteMany({ where: { sessionId: qualiSession.id } });
        await prisma.sectorTime.deleteMany({ where: { sessionId: qualiSession.id } });
        await prisma.pitStop.deleteMany({ where: { sessionId: qualiSession.id } });
        console.log(`♻️  Reimporting qualifying session data: ${qualiName}`);
      } else {
        existingQualiSession = true;
        console.log(`⏭️  Qualifying session already exists, skipping: ${qualiName}`);
      }
    }
  }

  if (raceResultFile) {
    const raceName = `${folderName} Rennen`;
    const raceDate = nlsKey ? buildSessionDate(nlsKey, 'RACE') : null;
    raceSession = await prisma.session.findFirst({
      where: { name: raceName, type: 'RACE' }
    });

    if (!raceSession) {
      raceSession = await prisma.session.create({
        data: {
          name: raceName,
          type: 'RACE',
          date: raceDate || new Date()
        }
      });
      console.log(`✅ Created race session`);
    } else {
      if (reimportExisting) {
        await prisma.result.deleteMany({ where: { sessionId: raceSession.id } });
        await prisma.lap.deleteMany({ where: { sessionId: raceSession.id } });
        await prisma.sectorTime.deleteMany({ where: { sessionId: raceSession.id } });
        await prisma.pitStop.deleteMany({ where: { sessionId: raceSession.id } });
        console.log(`♻️  Reimporting race session data: ${raceName}`);
      } else {
        existingRaceSession = true;
        console.log(`⏭️  Race session already exists, skipping: ${raceName}`);
      }
    }
  }

  // Import Qualifying Results
  if (qualiSession && qualiResultFile && !existingQualiSession) {
    console.log('🏎️  Importing qualifying results...');
    const qualiResults = parseCSV(path.join(folderPath, qualiResultFile));
    
    let count = 0;
    for (const row of qualiResults) {
      const driverInfo = getDriverInfo(row, 1);
      const startNumber = parseInt(row.STNR) || 0;
      
      const fahrzeug = cleanValue(row.FAHRZEUG);
      if (!row.STNR || !fahrzeug || startNumber === 0) {
        continue;
      }

      const driver = await findOrCreateDriver(driverInfo, startNumber);

      const teamName = resolveTeamName(row, startNumber);
      const team = await prisma.team.upsert({
        where: { name: teamName },
        update: {},
        create: { name: teamName }
      });

      const vehicle = await prisma.vehicle.upsert({
        where: { id: `${team.id}_${fahrzeug}` },
        update: {},
        create: {
          model: fahrzeug || 'Unknown',
          vehicleClass: cleanValue(row.KLASSE) || 'Unknown',
          teamId: team.id
        }
      });

      await prisma.result.create({
        data: {
          sessionId: qualiSession.id,
          startNumber: startNumber,
          position: parseInt(row.RANG) || null,
          laps: parseInt(row.RUNDEN) || null,
          bestLapTime: parseTime(cleanValue(row['SCHNELLSTE RUNDE']) || '0'),
          totalTime: parseTime(cleanValue(row.GESAMTZEIT)) || null,
          gap: cleanValue(row.GAP) || null,
          interval: cleanValue(row.KLASSENGAP) || null,
          status: cleanValue(row.STATUS) || null,
          driverId: driver.id,
          teamId: team.id,
          vehicleId: vehicle.id
        }
      });
      count++;
    }
    console.log(`✅ Imported ${count} qualifying results`);
  }

  // Import Race Results
  if (raceSession && raceResultFile && !existingRaceSession) {
    console.log('🏁 Importing race results...');
    const raceResults = parseCSV(path.join(folderPath, raceResultFile));
    
    let count = 0;
    for (const row of raceResults) {
      const driverInfo = getDriverInfo(row, 1);
      const startNumber = parseInt(row.STNR) || 0;
      
      const fahrzeug = cleanValue(row.FAHRZEUG);
      if (!row.STNR || !fahrzeug || startNumber === 0) {
        continue;
      }

      const driver = await findOrCreateDriver(driverInfo, startNumber);

      const teamName = resolveTeamName(row, startNumber);
      const team = await prisma.team.upsert({
        where: { name: teamName },
        update: {},
        create: { name: teamName }
      });

      const vehicle = await prisma.vehicle.upsert({
        where: { id: `${team.id}_${fahrzeug}` },
        update: {},
        create: {
          model: fahrzeug || 'Unknown',
          vehicleClass: cleanValue(row.KLASSE) || 'Unknown',
          teamId: team.id
        }
      });

      await prisma.result.create({
        data: {
          sessionId: raceSession.id,
          startNumber: startNumber,
          position: parseInt(row.RANG) || null,
          laps: parseInt(row.RUNDEN) || null,
          bestLapTime: parseTime(cleanValue(row['SCHNELLSTE RUNDE']) || '0'),
          totalTime: parseTime(cleanValue(row.GESAMTZEIT)) || null,
          gap: cleanValue(row.GAP) || null,
          interval: cleanValue(row.KLASSENGAP) || null,
          status: cleanValue(row.STATUS) || null,
          driverId: driver.id,
          teamId: team.id,
          vehicleId: vehicle.id
        }
      });
      count++;
    }
    console.log(`✅ Imported ${count} race results`);
  }

  // Import Lap Times
  if ((qualiSession && qualiLapsFile && !existingQualiSession) || (raceSession && raceLapsFile && !existingRaceSession)) {
    console.log('⏱️  Importing lap times...');

    if (qualiSession && qualiLapsFile && !existingQualiSession) {
      const qualiLaps = parseCSV(path.join(folderPath, qualiLapsFile));
      let count = 0;
      
      for (const row of qualiLaps) {
        const startNumber = parseInt(row.STNR) || 0;
        const driverIndex = parseInt(row.DRIVERID || '1');
        const driverInfo = getDriverInfo(row, Number.isFinite(driverIndex) ? driverIndex : 1);
        const teamName = resolveTeamName(row, startNumber);

        if (startNumber === 0) {
          continue;
        }
        const driver = await findOrCreateDriver(driverInfo, startNumber);

        if (driver) {
          const team = await prisma.team.upsert({
            where: { name: teamName },
            update: {},
            create: { name: teamName }
          });

          const model = cleanValue(row.FAHRZEUG) || 'Unknown';
          const vehicle = await prisma.vehicle.upsert({
            where: { id: `${team.id}_${model}` },
            update: {},
            create: {
              model,
              vehicleClass: getVehicleClass(row),
              teamId: team.id
            }
          });
          const vehicleId = vehicle.id;

          await prisma.lap.create({
            data: {
              sessionId: qualiSession.id,
              startNumber,
              lapNumber: parseInt(row.RUNDE_NR || row.RUNDE) || 0,
              lapTime: parseFloat(cleanValue(row.RUNDENZEIT_SEKUNDEN)?.replace(',', '.')) || 0,
              driverId: driver.id,
              vehicleId: vehicleId
            }
          });
          count++;
        }
      }
      console.log(`✅ Imported ${count} qualifying lap times`);
    }

    if (raceSession && raceLapsFile && !existingRaceSession) {
      const raceLaps = parseCSV(path.join(folderPath, raceLapsFile));
      let count = 0;
      
      for (const row of raceLaps) {
        const startNumber = parseInt(row.STNR) || 0;
        const driverIndex = parseInt(row.DRIVERID || '1');
        const driverInfo = getDriverInfo(row, Number.isFinite(driverIndex) ? driverIndex : 1);
        const teamName = resolveTeamName(row, startNumber);

        if (startNumber === 0) {
          continue;
        }
        const driver = await findOrCreateDriver(driverInfo, startNumber);

        if (driver) {
          const team = await prisma.team.upsert({
            where: { name: teamName },
            update: {},
            create: { name: teamName }
          });

          const model = cleanValue(row.FAHRZEUG) || 'Unknown';
          const vehicle = await prisma.vehicle.upsert({
            where: { id: `${team.id}_${model}` },
            update: {},
            create: {
              model,
              vehicleClass: getVehicleClass(row),
              teamId: team.id
            }
          });
          const vehicleId = vehicle.id;

          await prisma.lap.create({
            data: {
              sessionId: raceSession.id,
              startNumber,
              lapNumber: parseInt(row.RUNDE) || 0,
              lapTime: parseFloat(cleanValue(row.RUNDENZEIT_SEKUNDEN)?.replace(',', '.')) || 0,
              driverId: driver.id,
              vehicleId: vehicleId
            }
          });
          count++;
        }
      }
      console.log(`✅ Imported ${count} race lap times`);
    }
  }

  // Import Sector Times
  if ((qualiSession && qualiSectorsFile && !existingQualiSession) || (raceSession && raceSectorsFile && !existingRaceSession)) {
    console.log('📈 Importing sector times...');

    if (qualiSession && qualiSectorsFile && !existingQualiSession) {
      const qualiSectors = parseCSV(path.join(folderPath, qualiSectorsFile));
      let count = 0;
      
      for (const row of qualiSectors) {
        const startNumber = parseInt(row.STNR) || 0;
        const driverIndex = parseInt(row.FAHRER_NR || '1');
        const driverInfo = getDriverInfo(row, Number.isFinite(driverIndex) ? driverIndex : 1);
        const teamName = resolveTeamName(row, startNumber);

        if (startNumber === 0) {
          continue;
        }
        const driver = await findOrCreateDriver(driverInfo, startNumber);

        if (driver) {
          const team = await prisma.team.upsert({
            where: { name: teamName },
            update: {},
            create: { name: teamName }
          });

          const model = cleanValue(row.FAHRZEUG) || 'Unknown';
          const vehicle = await prisma.vehicle.upsert({
            where: { id: `${team.id}_${model}` },
            update: {},
            create: {
              model,
              vehicleClass: getVehicleClass(row),
              teamId: team.id
            }
          });
          const vehicleId = vehicle.id;

          await prisma.sectorTime.create({
            data: {
              sessionId: qualiSession.id,
              startNumber,
              lapNumber: parseInt(row.RUNDE) || 0,
              sector1: parseSectorValue(row.SEKTOR_1),
              sector2: parseSectorValue(row.SEKTOR_2),
              sector3: parseSectorValue(row.SEKTOR_3),
              sector4: parseSectorValue(row.SEKTOR_4),
              sector5: parseSectorValue(row.SEKTOR_5),
              driverId: driver.id,
              vehicleId: vehicleId
            }
          });
          count++;

          const inPit = cleanValue(row.INPIT).toUpperCase() === 'J';
          const pitDuration = parsePitDuration(row.PITSTOPDURATION);
          const lapNumber = parseInt(row.RUNDE_NR || row.RUNDE) || 0;

          if (inPit && pitDuration > 0) {
            const existingPit = await prisma.pitStop.findFirst({
              where: {
                sessionId: qualiSession.id,
                startNumber,
                lapNumber
              }
            });

            if (!existingPit) {
              await prisma.pitStop.create({
                data: {
                  sessionId: qualiSession.id,
                  teamId: team.id,
                  startNumber,
                  lapNumber,
                  duration: pitDuration > 0 ? pitDuration : null
                }
              });
            }
          }
        }
      }
      console.log(`✅ Imported ${count} qualifying sector times`);
    }

    if (raceSession && raceSectorsFile && !existingRaceSession) {
      const raceSectors = parseCSV(path.join(folderPath, raceSectorsFile));
      let count = 0;
      
      for (const row of raceSectors) {
        const startNumber = parseInt(row.STNR) || 0;
        const driverIndex = parseInt(row.FAHRER_NR || '1');
        const driverInfo = getDriverInfo(row, Number.isFinite(driverIndex) ? driverIndex : 1);
        const teamName = resolveTeamName(row, startNumber);

        if (startNumber === 0) {
          continue;
        }
        const driver = await findOrCreateDriver(driverInfo, startNumber);

        if (driver) {
          const team = await prisma.team.upsert({
            where: { name: teamName },
            update: {},
            create: { name: teamName }
          });

          const model = cleanValue(row.FAHRZEUG) || 'Unknown';
          const vehicle = await prisma.vehicle.upsert({
            where: { id: `${team.id}_${model}` },
            update: {},
            create: {
              model,
              vehicleClass: getVehicleClass(row),
              teamId: team.id
            }
          });
          const vehicleId = vehicle.id;

          await prisma.sectorTime.create({
            data: {
              sessionId: raceSession.id,
              startNumber,
              lapNumber: parseInt(row.RUNDE_NR || row.RUNDE) || 0,
              sector1: parseSectorValue(row.SEKTOR_1),
              sector2: parseSectorValue(row.SEKTOR_2),
              sector3: parseSectorValue(row.SEKTOR_3),
              sector4: parseSectorValue(row.SEKTOR_4),
              sector5: parseSectorValue(row.SEKTOR_5),
              driverId: driver.id,
              vehicleId: vehicleId
            }
          });
          count++;

          const inPit = cleanValue(row.INPIT).toUpperCase() === 'J';
          const pitDuration = parsePitDuration(row.PITSTOPDURATION);
          const lapNumber = parseInt(row.RUNDE_NR || row.RUNDE) || 0;

          if (inPit && pitDuration > 0) {
            const existingPit = await prisma.pitStop.findFirst({
              where: {
                sessionId: raceSession.id,
                startNumber,
                lapNumber
              }
            });

            if (!existingPit) {
              await prisma.pitStop.create({
                data: {
                  sessionId: raceSession.id,
                  teamId: team.id,
                  startNumber,
                  lapNumber,
                  duration: pitDuration > 0 ? pitDuration : null
                }
              });
            }
          }
        }
      }
      console.log(`✅ Imported ${count} race sector times`);
    }
  }
}

async function importData() {
  console.log('🏁 Starting CSV import from data_2025...\n');

  const importOnlyRaw = process.env.IMPORT_ONLY;
  const importOnly = importOnlyRaw
    ? importOnlyRaw.split(',').map((v) => v.trim().toUpperCase()).filter(Boolean)
    : null;

  const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data_2025');

  if (!fs.existsSync(dataDir)) {
    console.log(`⚠️  Data directory not found: ${dataDir}`);
    return;
  }

  // Get all NLS folders
  const folders = fs.readdirSync(dataDir).filter((f: string) => {
    const fullPath = path.join(dataDir, f);
    try {
      const isNls = fs.statSync(fullPath).isDirectory() && f.toUpperCase().startsWith('NLS');
      if (!isNls) {
        return false;
      }

      if (!importOnly) {
        return true;
      }

      return importOnly.includes(f.toUpperCase());
    } catch {
      return false;
    }
  }).sort(); // Sort so NLS1, NLS2, ..., NLS10

  console.log(`Found ${folders.length} NLS folders\n`);

  // Process each NLS folder
  for (const folder of folders) {
    try {
      await processNLSFolder(folder, path.join(dataDir, folder));
    } catch (error) {
      console.error(`❌ Error processing ${folder}:`, error);
    }
  }

  console.log('\n🎉 Import completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   Sessions: ${await prisma.session.count()}`);
  console.log(`   Drivers: ${await prisma.driver.count()}`);
  console.log(`   Teams: ${await prisma.team.count()}`);
  console.log(`   Vehicles: ${await prisma.vehicle.count()}`);
  console.log(`   Results: ${await prisma.result.count()}`);
  console.log(`   Laps: ${await prisma.lap.count()}`);
  console.log(`   Sector Times: ${await prisma.sectorTime.count()}`);
}

importData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());


