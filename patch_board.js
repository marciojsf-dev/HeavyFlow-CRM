const fs = require('fs');
let code = fs.readFileSync('src/pages/Board.tsx', 'utf-8');

// Imports
code = code.replace(
  "import { Input } from '@/components/ui/input';",
  "import { Input } from '@/components/ui/input';\nimport { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';\nimport { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';\nimport { Label } from '@/components/ui/label';\nimport { Filter, Users, Building, Tags } from 'lucide-react';\nimport { db } from '../lib/firebase';\nimport { collection, query, where, getDocs } from 'firebase/firestore';"
);

// Interfaces
code = code.replace(
  "  unread_count: number;\n}",
  "  unread_count: number;\n  tags: string[];\n  agent_id: string;\n  department_id: string;\n}"
);

fs.writeFileSync('src/pages/Board.tsx', code);
