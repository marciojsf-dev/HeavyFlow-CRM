const fs = require('fs');
let code = fs.readFileSync('src/pages/CompanySettings.tsx', 'utf8');

const validationLogic = `
  const isValidDocument = (doc: string) => {
    const numbers = doc.replace(/\\D/g, '');
    if (!numbers) return true; // allow empty if not strictly required
    if (numbers.length === 11) {
      // Basic CPF validation
      if (numbers.match(/(\\d)\\1{10}/)) return false;
      let sum = 0;
      for (let i = 0; i < 9; i++) sum += parseInt(numbers.charAt(i)) * (10 - i);
      let rev = 11 - (sum % 11);
      if (rev === 10 || rev === 11) rev = 0;
      if (rev !== parseInt(numbers.charAt(9))) return false;
      sum = 0;
      for (let i = 0; i < 10; i++) sum += parseInt(numbers.charAt(i)) * (11 - i);
      rev = 11 - (sum % 11);
      if (rev === 10 || rev === 11) rev = 0;
      if (rev !== parseInt(numbers.charAt(10))) return false;
      return true;
    }
    if (numbers.length === 14) {
      // Basic CNPJ validation
      if (numbers.match(/(\\d)\\1{13}/)) return false;
      let size = numbers.length - 2;
      let numbersStr = numbers.substring(0, size);
      const digits = numbers.substring(size);
      let sum = 0;
      let pos = size - 7;
      for (let i = size; i >= 1; i--) {
        sum += parseInt(numbersStr.charAt(size - i)) * pos--;
        if (pos < 2) pos = 9;
      }
      let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
      if (result !== parseInt(digits.charAt(0))) return false;
      size = size + 1;
      numbersStr = numbers.substring(0, size);
      sum = 0;
      pos = size - 7;
      for (let i = size; i >= 1; i--) {
        sum += parseInt(numbersStr.charAt(size - i)) * pos--;
        if (pos < 2) pos = 9;
      }
      result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
      if (result !== parseInt(digits.charAt(1))) return false;
      return true;
    }
    return false;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.documento) {
      const isDocValid = isValidDocument(formData.documento);
      if (!isDocValid) {
        toast.error('CPF ou CNPJ inválido');
        return;
      }
    }
    
    if (formData.telefone && formData.telefone.replace(/\\D/g, '').length < 10) {
      toast.error('Telefone inválido');
      return;
    }
    
    setLoading(true);`;

code = code.replace(
  "  const handleSave = async (e: React.FormEvent) => {\n    e.preventDefault();\n    setLoading(true);",
  validationLogic
);

fs.writeFileSync('src/pages/CompanySettings.tsx', code);
