/**
 * India Location Data Import Script - Batch Insert Version
 *
 * Uses batch inserts for efficiency with NeonDB serverless.
 *
 * Usage: npm run import:data
 */

import * as XLSX from 'xlsx';
import path from 'path';

const DATASET_PATH = 'C:\\Users\\Ashish Kumar\\Downloads\\all-india-villages-master-list-excel (1)\\dataset';

const STATE_CODES = {
  '01': 'JAMMU & KASHMIR', '02': 'HIMACHAL PRADESH', '03': 'PUNJAB', '04': 'CHANDIGARH',
  '05': 'UTTARAKHAND', '06': 'HARYANA', '07': 'DELHI', '08': 'RAJASTHAN',
  '09': 'UTTAR PRADESH', '10': 'BIHAR', '11': 'SIKKIM', '12': 'ARUNACHAL PRADESH',
  '13': 'NAGALAND', '14': 'MANIPUR', '15': 'MIZORAM', '16': 'TRIPURA',
  '17': 'MEGHALAYA', '18': 'ASSAM', '19': 'WEST BENGAL', '20': 'JHARKHAND',
  '21': 'ODISHA', '22': 'CHHATTISGARH', '23': 'MADHYA PRADESH', '24': 'GUJARAT',
  '25': 'DAMAN & DIU', '26': 'DADRA & NAGAR HAVELI', '27': 'MAHARASHTRA',
  '28': 'ANDHRA PRADESH', '29': 'KARNATAKA', '30': 'GOA', '31': 'LAKSHADWEEP',
  '32': 'KERALA', '33': 'TAMIL NADU', '34': 'PUDUCHERRY', '35': 'ANDAMAN & NICOBAR ISLANDS',
  '36': 'LADAKH'
};

const BATCH_SIZE = 500;

async function createPrismaClient() {
  const { PrismaClient } = await import('@prisma/client');
  return new PrismaClient();
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function importState(filePath, stateCodeStr) {
  const prisma = await createPrismaClient();

  try {
    await prisma.$connect();

    const workbook = XLSX.read(filePath, { type: 'file' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    const stateName = STATE_CODES[stateCodeStr] || `STATE_${stateCodeStr}`;
    const stateIdNum = parseInt(stateCodeStr);

    console.log(`\n  Processing ${stateName}...`);

    // Ensure country exists
    let country = await prisma.country.findFirst();
    if (!country) {
      country = await prisma.country.create({ data: { id: 1, name: 'India', code: 'IN' } });
    }

    // Ensure state exists
    let state = await prisma.state.findFirst({ where: { code: stateCodeStr } });
    if (!state) {
      state = await prisma.state.create({
        data: {
          id: stateIdNum,
          name: stateName.toUpperCase(),
          code: stateCodeStr,
          countryId: country.id
        }
      });
    }

    const districtsToCreate = [];
    const subDistrictsToCreate = [];
    const villagesToCreate = [];

    for (const row of rows) {
      const stateCodeFromData = row['MDDS STC'];
      const districtCode = row['MDDS DTC'];
      const subDistrictCode = row['MDDS Sub_DT'];
      const villageCode = row['MDDS PLCN'];
      const districtName = row['DISTRICT NAME'];
      const subDistrictName = row['SUB-DISTRICT NAME'];
      const villageName = row['Area Name'];

      // Skip state-level rows
      if (districtCode === '000') continue;
      if (stateCodeFromData !== stateCodeStr) continue;

      // Create district
      const districtId = stateIdNum * 1000 + parseInt(districtCode);
      if (!districtsToCreate.find(d => d.code === districtCode)) {
        districtsToCreate.push({
          id: districtId,
          name: districtName?.toUpperCase() || 'UNKNOWN',
          code: districtCode,
          stateId: state.id
        });
      }

      // Create sub-district
      if (subDistrictCode !== '00000') {
        const subKey = `${districtCode}_${subDistrictCode}`;
        const subDistrictId = stateIdNum * 100000 + parseInt(districtCode) * 100 + parseInt(subDistrictCode);

        if (!subDistrictsToCreate.find(sd => sd.code === subDistrictCode && sd.districtId === districtId)) {
          subDistrictsToCreate.push({
            id: subDistrictId,
            name: subDistrictName?.toUpperCase() || 'UNKNOWN',
            code: subDistrictCode,
            districtId: districtId
          });
        }

        // Create village
        if (villageCode !== '000000') {
          villagesToCreate.push({
            name: villageName?.toUpperCase() || 'UNKNOWN',
            code: villageCode,
            subDistrictId: subDistrictId
          });
        }
      }
    }

    // Batch insert districts
    for (let i = 0; i < districtsToCreate.length; i += BATCH_SIZE) {
      const batch = districtsToCreate.slice(i, i + BATCH_SIZE);
      await prisma.district.createMany({
        data: batch,
        skipDuplicates: true
      });
    }

    // Batch insert sub-districts
    for (let i = 0; i < subDistrictsToCreate.length; i += BATCH_SIZE) {
      const batch = subDistrictsToCreate.slice(i, i + BATCH_SIZE);
      await prisma.subDistrict.createMany({
        data: batch,
        skipDuplicates: true
      });
    }

    // Batch insert villages
    let villageInserted = 0;
    for (let i = 0; i < villagesToCreate.length; i += BATCH_SIZE) {
      const batch = villagesToCreate.slice(i, i + BATCH_SIZE);
      try {
        const result = await prisma.village.createMany({
          data: batch,
          skipDuplicates: true
        });
        villageInserted += result.count;
      } catch (error) {
        console.log(`      Village batch error: ${error.message}`);
      }

      // Progress update
      if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= villagesToCreate.length) {
        console.log(`      Villages: ${i + BATCH_SIZE}/${villagesToCreate.length}`);
      }
    }

    console.log(`    ✓ ${stateName}: ${districtsToCreate.length} districts, ${subDistrictsToCreate.length} sub-districts, ${villageInserted} villages`);

    return { state, districtCount: districtsToCreate.length, subDistrictCount: subDistrictsToCreate.length, villageCount: villageInserted };

  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  India Location Data Import Script');
  console.log('═'.repeat(60));

  try {
    const fs = await import('fs');
    const files = fs.readdirSync(DATASET_PATH)
      .filter(f => f.endsWith('.xls') || f.endsWith('.ods'))
      .sort();

    console.log(`\nFound ${files.length} state files\n`);

    let totalDistricts = 0;
    let totalSubDistricts = 0;
    let totalVillages = 0;

    for (const file of files) {
      const match = file.match(/Rdir_\d+_(\d+)_/);
      if (!match) {
        console.log(`  Skipping ${file} (unknown format)`);
        continue;
      }

      const stateCode = match[1];

      if (!STATE_CODES[stateCode]) {
        console.log(`  Skipping ${file} (unknown state code: ${stateCode})`);
        continue;
      }

      const filePath = path.join(DATASET_PATH, file);

      try {
        const result = await importState(filePath, stateCode);
        totalDistricts += result.districtCount;
        totalSubDistricts += result.subDistrictCount;
        totalVillages += result.villageCount;
      } catch (error) {
        console.error(`    ✗ Error importing ${file}: ${error.message}`);
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('  Import Complete!');
    console.log('═'.repeat(60));

    const prisma = await createPrismaClient();
    const states = await prisma.state.count();
    const districts = await prisma.district.count();
    const subDistricts = await prisma.subDistrict.count();
    const villages = await prisma.village.count();

    console.log(`  States:        ${states}`);
    console.log(`  Districts:     ${districts}`);
    console.log(`  Sub-districts: ${subDistricts}`);
    console.log(`  Villages:      ${villages}`);
    console.log('═'.repeat(60));
    console.log('\n✓ All data imported successfully!\n');

    await prisma.$disconnect();

  } catch (error) {
    console.error('\n✗ Import failed:', error.message);
    process.exit(1);
  }
}

main();
