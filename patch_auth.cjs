const fs = require('fs');
let code = fs.readFileSync('src/lib/AuthContext.tsx', 'utf8');

const target = `  const refreshProfile = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, 'users', user.uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        if (user.email === 'marciojsf@gmail.com') {
          data.role = 'admin';
          data.isSuperAdmin = true;
        }

            // Check subscription status`;

const replacement = `  const refreshProfile = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, 'users', user.uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        if (user.email === 'marciojsf@gmail.com') {
          data.role = 'admin';
          data.isSuperAdmin = true;
        }
        
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

code = code.replace(target, replacement);
fs.writeFileSync('src/lib/AuthContext.tsx', code);
