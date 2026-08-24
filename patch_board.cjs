const fs = require('fs');
let code = fs.readFileSync('src/pages/Board.tsx', 'utf-8');

// Replace imports
code = code.replace(
  "import { MessageSquare, Kanban, Search } from 'lucide-react';",
  "import { MessageSquare, Kanban, Search, Filter, Building, Users, Tags } from 'lucide-react';\nimport { db } from '../lib/firebase';\nimport { collection, query, where, getDocs } from 'firebase/firestore';\nimport { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';\nimport { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';\nimport { Label } from '@/components/ui/label';"
);

// Interface update
code = code.replace(
  "  unread_count: number;\n}",
  "  unread_count: number;\n  tags: string[];\n  agent_id: string;\n  department_id: string;\n}"
);

fs.writeFileSync('src/pages/Board.tsx', code);
