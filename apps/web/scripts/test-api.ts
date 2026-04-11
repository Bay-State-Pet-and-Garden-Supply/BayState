const response = await fetch('http://localhost:3000/api/admin/pipeline/export-xml', {
  headers: {
    // I can't easily mock auth here, I'll check the lib directly
  }
});
