const fs = require('fs');
let code = fs.readFileSync('src/lib/AuthContext.tsx', 'utf8');

const replacement = `
        if (data.companySetupComplete === undefined) {
          data.companySetupComplete = true;
        }

        if (data.teamId) {
          try {
            const teamDoc = await getDoc(doc(db, 'teams', data.teamId));
            if (teamDoc.exists()) {
              data.teamName = teamDoc.data().name;
            }
          } catch (e) { console.error("Error loading team name", e); }
        }

            // Check subscription status`;

code = code.replace(
  "        }\n        \n            // Check subscription status",
  "        }" + replacement
);

fs.writeFileSync('src/lib/AuthContext.tsx', code);
