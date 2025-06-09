

document.addEventListener('DOMContentLoaded', () => {
  let ordersFiles = [];
  let deliveriesFiles = [];
  let ordersFull = [];
  let deliveriesFull = [];
  let matchedFull = [];
  let finalCleanedData = [];

  let activeFilters = {
    stores: []
  };

  let filteredOrders = [];
  let filteredDeliveries = [];

  document.getElementById('clearFilterButton').addEventListener('click', () => {
    const storeFilter = document.getElementById('storeFilter');
    Array.from(storeFilter.options).forEach(option => option.selected = false);
  
    // Clear filters and reapply with full data
    activeFilters.stores = [];
    filteredOrders = ordersFull;
    filteredDeliveries = deliveriesFull;
    cleanAndMatchData();
    showSummary();
    showVisualizations();
    openTab('summaryTab');
  });  

  function populateStoreFilter() {
    const allStores = new Set([
      ...ordersFull.map(row => normalize(row.Store)),
      ...deliveriesFull.map(row => normalize(row.Store))
    ]);

    const storeFilter = document.getElementById('storeFilter');
    storeFilter.innerHTML = '';

    allStores.forEach(store => {
      const option = document.createElement('option');
      option.value = store;
      option.textContent = store;
      storeFilter.appendChild(option);
    });
  }

  
  function applyFilters() {
    const storeSelect = document.getElementById('storeFilter');
    activeFilters.stores = Array.from(storeSelect.selectedOptions).map(opt => normalize(opt.value));
  
    // Save filtered globally
    filteredOrders = ordersFull.filter(row => passesFilters(row));
    filteredDeliveries = deliveriesFull.filter(row => passesFilters(row));
  
    // Rematch based on filters
    matchedFull = filteredOrders.map(order => {
      const matchingDelivery = filteredDeliveries.find(delivery =>
        normalize(delivery['PO nos.']) === normalize(order['No.']) &&
        normalize(delivery['Store']) === normalize(order['Store'])
      );
  
      return {
        ...order,
        Matched: !!matchingDelivery,
        Delivery_No: matchingDelivery ? matchingDelivery['No.'] : null,
        Delivery_PO_nos: matchingDelivery ? matchingDelivery['PO nos.'] : null,
        Delivery_Store: matchingDelivery ? matchingDelivery['Store'] : null
      };
    });
  
    finalCleanedData = matchedFull;
  
    showSummary();
    showVisualizations();
    openTab('summaryTab');
  }
  
  

  function passesFilters(row) {
    const storeMatch = activeFilters.stores.length === 0 || activeFilters.stores.includes(normalize(row.Store));
    return storeMatch;
  }
  
  document.getElementById('ordersInput').addEventListener('change', function(event) {
    ordersFiles = Array.from(event.target.files);
    checkBothUploaded();
  });

  document.getElementById('deliveriesInput').addEventListener('change', function(event) {
    deliveriesFiles = Array.from(event.target.files);
    checkBothUploaded();
  });

  function checkBothUploaded() {
    if (ordersFiles.length > 0 && deliveriesFiles.length > 0) {
      showLoading();
      setTimeout(() => {
        loadAndProcessFiles();
      }, 300);
    }
  }

  function loadAndProcessFiles() {
    const ordersPromises = ordersFiles.map(file => parseFile(file));
    const deliveriesPromises = deliveriesFiles.map(file => parseFile(file));    
    
    Promise.all([Promise.all(ordersPromises), Promise.all(deliveriesPromises)])
      .then(([ordersData, deliveriesData]) => {
        ordersFull = ordersData.flat();
        deliveriesFull = deliveriesData.flat();
        filteredOrders = ordersFull;
        filteredDeliveries = deliveriesFull;
        populateStoreFilter();
        cleanAndMatchData();
        showSummary();
        showVisualizations();
        hideLoading();
        alert('Files successfully processed!');
      })
      
      .catch(err => {
        hideLoading();
        alert('Error processing files: ' + err.message);
        console.error(err);
      });
      
    }

  function parseFile(file) {
    return new Promise((resolve, reject) => {
      const extension = file.name.split('.').pop().toLowerCase();
  
      if (extension === 'csv') {
        Papa.parse(file, {
          complete: function(results) {
            const raw = results.data;
            if (raw.length < 2) {
              reject(new Error('CSV missing header rows'));
              return;
            }
  
            const headers = raw[1]; // Use second row as headers
            const rows = raw.slice(2).filter(row => {
              return row.join('').trim() !== '' && !row.includes('TOTAL');
            });
  
            const formattedData = rows.map(row => {
              const obj = {};
              headers.forEach((header, idx) => {
                obj[header?.toString().trim()] = row[idx];
              });
              return obj;
            });
  
            resolve(formattedData);
          },
          error: function(err) {
            reject(err);
          },
          header: false,
          skipEmptyLines: true,
          dynamicTyping: true
        });
      } else if (extension === 'xls' || extension === 'xlsx') {
        const reader = new FileReader();
        reader.onload = function(e) {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
  
          const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          if (rawData.length < 2) {
            reject(new Error('Excel missing sufficient rows'));
            return;
          }
  
          const headers = rawData[1]; // Use second row as headers
          const dataRows = rawData.slice(2).filter(row => {
            return row.join('').trim() !== '' && !row.includes('TOTAL');
          });
  
          const formattedData = dataRows.map(row => {
            const obj = {};
            headers.forEach((header, idx) => {
              obj[header?.toString().trim()] = row[idx];
            });
            return obj;
          });
  
          resolve(formattedData);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      } else {
        reject(new Error('Unsupported file format'));
      }
    });
  }
  

  function normalize(str) {
    return String(str || '').trim().toLowerCase();
  }
  
  function cleanAndMatchData() {
    // Normalize all keys
    ordersFull.forEach(row => {
      row['No.'] = normalize(row['No.']);
      row['Store'] = normalize(row['Store']);
      if (row['Store'] === 'clark kerr campus (ckc)') row['Store'] = 'clark kerr campus';
    });
  
    deliveriesFull.forEach(row => {
      row['PO nos.'] = normalize(row['PO nos.']);
      row['Store'] = normalize(row['Store']);
      if (row['Store'] === 'clark kerr campus (ckc)') row['Store'] = 'clark kerr campus';
    });
  
    // Match based on cleaned values
    matchedFull = ordersFull.map(order => {
      const matchingDelivery = deliveriesFull.find(delivery =>
        normalize(delivery['PO nos.']) === normalize(order['No.']) &&
        normalize(delivery['Store']) === normalize(order['Store'])
      );
  
      return {
        ...order,
        Matched: !!matchingDelivery,
        Delivery_No: matchingDelivery ? matchingDelivery['No.'] : null,
        Delivery_PO_nos: matchingDelivery ? matchingDelivery['PO nos.'] : null,
        Delivery_Store: matchingDelivery ? matchingDelivery['Store'] : null
      };
    });
  
    finalCleanedData = matchedFull;
  }

  function isDSDSupplier(supplier, store) {
    const normSupplier = normalize(supplier);
    const normStore = normalize(store);
  
    const dsdSuppliersList = [
      'pepperidge farms',
      'kikka sushi',
      'golden malted',
      'nuco2 llc',
      'wonder ice cream llc'
    ];
  
    const dsdPepsiStoresList = [
      'gbc', 'den', 'bear market', 'cub market', 'browns', 'cubby'
    ];
  
    const isPepsi = normSupplier.includes('pepsi');
    const isPepsiStore = dsdPepsiStoresList.includes(normStore);
  
    return dsdSuppliersList.some(dsd => normSupplier.includes(dsd)) || (isPepsi && isPepsiStore);
  }
  

  function showSummary() {
    // const filteredOrders = ordersFull.filter(row => passesFilters(row));
    // const filteredDeliveries = deliveriesFull.filter(row => passesFilters(row));
    const totalOrders = filteredOrders.length;
    const totalDeliveries = filteredDeliveries.length;
  
    const dsdSuppliers = [
      'pepperidge farms',
      'kikka',
      'golden malted',
      'nuco2 llc',
      'wonder ice cream llc',
      'pepsi bottling group inc'
    ];
  
    const pepsiStores = [
      'golden bear cafe', 'den', 'bear market', 'cub market', 'browns cafe', 'cubby'
    ];
  
    function normalize(value) {
      return value ? value.toString().trim().toLowerCase() : '';
    }
  
    // 1. Identify unmatched orders
    const unmatchedOrders = filteredOrders.filter(order => {
      const orderNo = normalize(order['No.']);
      return !filteredDeliveries.some(delivery => normalize(delivery['PO nos.']) === orderNo);
    });
  
    // 2. Identify unmatched deliveries
    const unmatchedDeliveriesRaw = filteredDeliveries.filter(delivery => {
      const poNo = normalize(delivery['PO nos.']);
      return !filteredOrders.some(order => normalize(order['No.']) === poNo);
    });
  
    // 3. Separate DSD unmatched deliveries
    const dsdUnmatchedDeliveries = unmatchedDeliveriesRaw.filter(delivery => {
      return isDSDSupplier(delivery['Supplier'], delivery['Store']);
    });
  
    // 4. Non-DSD unmatched deliveries
    const unmatchedDeliveries = unmatchedDeliveriesRaw.filter(delivery => {
      return !isDSDSupplier(delivery['Supplier'], delivery['Store']);
    });
  
    // 5. Orders with multiple deliveries (filtered only)
    const deliveryCount = {};
    filteredDeliveries.forEach(delivery => {
      const poNo = normalize(delivery['PO nos.']);
      if (poNo) {
        deliveryCount[poNo] = (deliveryCount[poNo] || 0) + 1;
      }
    });
    const multipleDeliveries = Object.values(deliveryCount).filter(count => count > 1).length;
  
    // 6. Percentages
    const percentOrdersWithoutDeliveries = ((unmatchedOrders.length / totalOrders) * 100).toFixed(2);
    const percentDeliveriesWithoutOrders = ((unmatchedDeliveries.length / totalDeliveries) * 100).toFixed(2);
  
    // 7. Show the Summary
    document.getElementById('summaryOutput').innerHTML = `
      <p><strong>Total Orders:</strong> ${totalOrders}</p>
      <p><strong>Total Deliveries:</strong> ${totalDeliveries}</p>
      <p><strong>Orders without Deliveries:</strong> ${unmatchedOrders.length}</p>
      <p><strong>Deliveries without Orders (excluding DSD):</strong> ${unmatchedDeliveries.length}</p>
      <p><strong>DSD Deliveries (excluded from match):</strong> ${dsdUnmatchedDeliveries.length}</p>
      <p><strong>Orders with Multiple Deliveries:</strong> ${multipleDeliveries}</p>
      <p><strong>Percent Orders without Deliveries:</strong> ${percentOrdersWithoutDeliveries}%</p>
      <p><strong>Percent Deliveries without Orders (excluding DSD):</strong> ${percentDeliveriesWithoutOrders}%</p>
    `;
  }  

  function countByField(data, field) {
    const counts = {};
    data.forEach(row => {
      const key = row[field] || 'Unknown';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  function showVisualizations() {
    // const filteredOrders = ordersFull.filter(row => passesFilters(row));
    // const filteredDeliveries = deliveriesFull.filter(row => passesFilters(row, 'Delivery date'));
  
    const unmatchedOrders = filteredOrders.filter(order => {
      return !filteredDeliveries.some(delivery =>
        normalize(delivery['PO nos.']) === normalize(order['No.']) &&
        normalize(delivery['Store']) === normalize(order['Store'])
      ) && !isDSDSupplier(order['Supplier'], order['Store']);
    });
  
    const unmatchedDeliveriesRaw = filteredDeliveries.filter(delivery => {
      return !filteredOrders.some(order =>
        normalize(order['No.']) === normalize(delivery['PO nos.']) &&
        normalize(order['Store']) === normalize(delivery['Store'])
      );
    });
  
    const unmatchedDeliveries = unmatchedDeliveriesRaw.filter(delivery => {
      return !isDSDSupplier(delivery['Supplier'], delivery['Store']);
    });
  
    const dsdDeliveries = unmatchedDeliveriesRaw.filter(delivery => {
      return isDSDSupplier(delivery['Supplier'], delivery['Store']);
    });
  
    // CHART 1: Unmatched Orders by Supplier
    const orderSupplierCounts = countByField(unmatchedOrders, 'Supplier');
    const topOrderSuppliers = Object.entries(orderSupplierCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const ctx1 = document.getElementById('chartCanvas1').getContext('2d');
    if (window.chart1) window.chart1.destroy();
    window.chart1 = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: topOrderSuppliers.map(x => x[0]),
        datasets: [{
          label: 'Unmatched Orders by Supplier',
          data: topOrderSuppliers.map(x => x[1]),
          backgroundColor: 'rgba(255, 99, 132, 0.6)'
        }]
      },
      options: { scales: { y: { beginAtZero: true } } }
    });
  
    // CHART 2: Unmatched Orders by Store
    const orderStoreCounts = countByField(unmatchedOrders, 'Store');
    const topOrderStores = Object.entries(orderStoreCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const ctx2 = document.getElementById('chartCanvas2').getContext('2d');
    if (window.chart2) window.chart2.destroy();
    window.chart2 = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: topOrderStores.map(x => x[0]),
        datasets: [{
          label: 'Unmatched Orders by Store',
          data: topOrderStores.map(x => x[1]),
          backgroundColor: 'rgba(54, 162, 235, 0.6)'
        }]
      },
      options: { scales: { y: { beginAtZero: true } } }
    });
  
    // CHART 3: Unmatched Deliveries by Supplier (non-DSD)
    const deliverySupplierCounts = countByField(unmatchedDeliveries, 'Supplier');
    const topDeliverySuppliers = Object.entries(deliverySupplierCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const ctx3 = document.getElementById('chartCanvas3').getContext('2d');
    if (window.chart3) window.chart3.destroy();
    window.chart3 = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: topDeliverySuppliers.map(x => x[0]),
        datasets: [{
          label: 'Unmatched Deliveries by Supplier',
          data: topDeliverySuppliers.map(x => x[1]),
          backgroundColor: 'rgba(255, 206, 86, 0.6)'
        }]
      },
      options: { scales: { y: { beginAtZero: true } } }
    });
  
    // CHART 4: Unmatched Deliveries by Store (non-DSD)
    const deliveryStoreCounts = countByField(unmatchedDeliveries, 'Store');
    const topDeliveryStores = Object.entries(deliveryStoreCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const ctx4 = document.getElementById('chartCanvas4').getContext('2d');
    if (window.chart4) window.chart4.destroy();
    window.chart4 = new Chart(ctx4, {
      type: 'bar',
      data: {
        labels: topDeliveryStores.map(x => x[0]),
        datasets: [{
          label: 'Unmatched Deliveries by Store',
          data: topDeliveryStores.map(x => x[1]),
          backgroundColor: 'rgba(153, 102, 255, 0.6)'
        }]
      },
      options: { scales: { y: { beginAtZero: true } } }
    });
  
    // CHART 5: Unmatched Over Time
    function getMonthKey(rawValue) {
      if (!rawValue) return 'Unknown';
  
      let date;
  
      if (typeof rawValue === 'number') {
        date = new Date(Math.round((rawValue - 25569) * 86400 * 1000));
      } else {
        const parsed = new Date(rawValue);
        if (isNaN(parsed)) return 'Unknown';
        date = parsed;
      }
  
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
  
    const orderDateCounts = {};
    unmatchedOrders.forEach(row => {
      const rawDate = row['Ordered'];
      const key = getMonthKey(rawDate);
      if (key !== 'Unknown') {
        orderDateCounts[key] = (orderDateCounts[key] || 0) + 1;
      }
    });
  
    const deliveryDateCounts = {};
    unmatchedDeliveries.forEach(row => {
      const rawDate = row['Delivery date'];
      const key = getMonthKey(rawDate);
      if (key !== 'Unknown') {
        deliveryDateCounts[key] = (deliveryDateCounts[key] || 0) + 1;
      }
    });
  
    const allMonths = Array.from(new Set([...Object.keys(orderDateCounts), ...Object.keys(deliveryDateCounts)])).sort();
  
    const ctx5 = document.getElementById('chartCanvas5').getContext('2d');
    if (window.chart5) window.chart5.destroy();
    window.chart5 = new Chart(ctx5, {
      type: 'line',
      data: {
        labels: allMonths,
        datasets: [
          {
            label: 'Unmatched Orders',
            data: allMonths.map(m => orderDateCounts[m] || 0),
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            tension: 0.3,
            fill: false
          },
          {
            label: 'Unmatched Deliveries',
            data: allMonths.map(m => deliveryDateCounts[m] || 0),
            borderColor: 'orange',
            backgroundColor: 'rgba(255, 165, 0, 0.2)',
            tension: 0.3,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Unmatched Orders & Deliveries Over Time (Monthly)'
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Month' }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Count' }
          }
        }
      }
    });
  
    // CHART 6: DSD Deliveries by Supplier
    const dsdSupplierCounts = countByField(dsdDeliveries, 'Supplier');
    const topDsdSuppliers = Object.entries(dsdSupplierCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const dsdCtx1 = document.getElementById('chartCanvas6').getContext('2d');
    if (window.chart6) window.chart6.destroy();
    window.chart6 = new Chart(dsdCtx1, {
      type: 'bar',
      data: {
        labels: topDsdSuppliers.map(x => x[0]),
        datasets: [{
          label: 'DSD Deliveries by Supplier',
          data: topDsdSuppliers.map(x => x[1]),
          backgroundColor: 'rgba(255, 159, 64, 0.6)'
        }]
      },
      options: { scales: { y: { beginAtZero: true } } }
    });
  
    // CHART 7: DSD Deliveries by Store
    const dsdStoreCounts = countByField(dsdDeliveries, 'Store');
    const topDsdStores = Object.entries(dsdStoreCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const dsdCtx2 = document.getElementById('chartCanvas7').getContext('2d');
    if (window.chart7) window.chart7.destroy();
    window.chart7 = new Chart(dsdCtx2, {
      type: 'bar',
      data: {
        labels: topDsdStores.map(x => x[0]),
        datasets: [{
          label: 'DSD Deliveries by Store',
          data: topDsdStores.map(x => x[1]),
          backgroundColor: 'rgba(75, 192, 192, 0.6)'
        }]
      },
      options: { scales: { y: { beginAtZero: true } } }
    });
  }  


  function showLoading() {
    document.getElementById('loadingSpinner').style.display = 'block';
  }

  function hideLoading() {
    document.getElementById('loadingSpinner').style.display = 'none';
  }

  window.downloadCleanedData = function() {
    const csvRows = [];
    const headers = Object.keys(finalCleanedData[0]);
    csvRows.push(headers.join(','));

    for (const row of finalCleanedData) {
      const values = headers.map(header => {
        const escaped = ('' + (row[header] || '')).replace(/"/g, '\\"');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'matched_orders_deliveries_clean.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  window.downloadOrdersData = function() {
    const csvRows = [];
    const headers = Object.keys(ordersFull[0]);
    csvRows.push(headers.join(','));

    for (const row of ordersFull) {
      const values = headers.map(header => {
        const escaped = ('' + (row[header] || '')).replace(/"/g, '\\"');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'cleaned_orders.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  window.downloadDeliveriesData = function() {
    const csvRows = [];
    const headers = Object.keys(deliveriesFull[0]);
    csvRows.push(headers.join(','));

    for (const row of deliveriesFull) {
      const values = headers.map(header => {
        const escaped = ('' + (row[header] || '')).replace(/"/g, '\\"');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'cleaned_deliveries.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  window.downloadData = function(type, asExcel = false) {
    let data, filename;
    if (type === 'merged') {
      data = finalCleanedData;
      filename = 'merged_orders_deliveries';
    } else if (type === 'unmatchedOrders') {
      data = matchedFull.filter(row => !row.Matched);
      filename = 'unmatched_orders';
    } else if (type === 'unmatchedDeliveries') {
      data = deliveriesFull.filter(delivery => {
        return !ordersFull.some(order =>
          normalize(order['No.']) === normalize(delivery['PO nos.'])
        );
      });
      filename = 'unmatched_deliveries';
    } else {
      alert('Invalid type for download.');
      return;
    }
  
    if (!data || data.length === 0) {
      alert('No data to export.');
      return;
    }
  
    if (asExcel) {
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      XLSX.writeFile(workbook, filename + '.xlsx');
    } else {
      const csvRows = [];
      const headers = Object.keys(data[0]);
      csvRows.push(headers.join(','));
      for (const row of data) {
        const values = headers.map(header => `"${(row[header] || '').toString().replace(/"/g, '\\"')}"`);
        csvRows.push(values.join(','));
      }
      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename + '.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    }
  };

  // ────────────────────────────────────────────────────────────────
//  REPLACEMENT: Financial-analysis logic that re-uses deliveriesFull
// ────────────────────────────────────────────────────────────────
window.submitFinancialAnalysis = function () {
  /* 1 ─ gather user selections */
  const months = Array.from(document.getElementById("monthSelect").selectedOptions)
    .map(opt => parseInt(opt.value))
    .filter(m => !isNaN(m));

  const years = Array.from(document.getElementById("yearSelect").selectedOptions)
    .map(opt => parseInt(opt.value))
    .filter(y => !isNaN(y));

  if (deliveriesFull.length === 0) {
    alert("Upload delivery files first on the Upload tab.");
    return;
  }
  if (months.length === 0 || years.length === 0) {
    alert("Please pick at least one month and one year.");
    return;
  }

  /* 2 ─ work on a *copy* of every delivery row already loaded */
  const df = deliveriesFull.map(r => ({ ...r }));      // shallow copy

  const deliveryDateCol = "Delivery date";
  const changedDateCol  = "Changed";
  const priceCol        = "Price";

  /* 3 ─ normalise / convert columns */
  df.forEach(row => {
    const rawDelivery = row[deliveryDateCol];
    row[deliveryDateCol] =
      typeof rawDelivery === "number"
        ? new Date(Math.round((rawDelivery - 25569) * 86400 * 1000))
        : new Date(String(rawDelivery || "").split(" ")[0]);

    const rawChanged = row[changedDateCol];
    row[changedDateCol] =
      typeof rawChanged === "number"
        ? new Date(Math.round((rawChanged - 25569) * 86400 * 1000))
        : new Date(String(rawChanged || "").split(" ")[0]);

    row[priceCol] = parseFloat(row[priceCol]) || 0;
  });

  /* 4 ─ helper: last Sunday / Monday-cycle */
  function findLastSunday(y, m, monday = false, lastDay = false) {
    if (lastDay) return new Date(y, m - 1, new Date(y, m, 0).getDate());
    if (m === 12) { y += 1; m = 1; } else { m += 1; }
    let d = new Date(y, m - 1, 1);
    d.setDate(d.getDate() - (d.getDay() === 0 ? 7 : d.getDay()));
    if (monday) d.setDate(d.getDate() + 1);
    return d;
  }

  /* 5 ─ main month-by-month calculations */
  const results = [];
  const allRelevantRows = [];

  years.forEach(year => {
    months.forEach(month => {
      const fiscalBeg = new Date(`${month}/1/${year}`);
      const diningBeg = (month === 1)
        ? findLastSunday(year - 1, 12, true)
        : (year === 2024 && month === 7)
          ? fiscalBeg
          : findLastSunday(year, month - 1, true);

      const fiscalEnd  = findLastSunday(year, month, false, true);
      const diningEnd  = findLastSunday(year, month);

      const fiscal = df
        .filter(r => r[deliveryDateCol] >= fiscalBeg && r[deliveryDateCol] <= fiscalEnd)
        .reduce((s, r) => s + r[priceCol], 0);

      const dining = df
        .filter(r => r[deliveryDateCol] >= diningBeg && r[deliveryDateCol] <= diningEnd)
        .reduce((s, r) => s + r[priceCol], 0);

      const diff = Math.abs(dining - fiscal);

      const relevantRows = df.filter(r =>
        r[deliveryDateCol].getMonth() === month - 1 &&
        r[deliveryDateCol].getFullYear() === year &&
        r[changedDateCol] > r[deliveryDateCol]
      );

      allRelevantRows.push(...relevantRows);

      const buckets = {
        "<1 week":   { count: 0, total: 0 },
        "1-2 weeks": { count: 0, total: 0 },
        "2-3 weeks": { count: 0, total: 0 },
        ">1 month":  { count: 0, total: 0 }
      };

      let totalDelay = 0;
      relevantRows.forEach(r => {
        const delay = Math.floor((r[changedDateCol] - r[deliveryDateCol]) / 86400000);
        totalDelay += delay;

        if (delay < 7)          { buckets["<1 week"].count++;   buckets["<1 week"].total   += r[priceCol]; }
        else if (delay < 14)    { buckets["1-2 weeks"].count++; buckets["1-2 weeks"].total += r[priceCol]; }
        else if (delay < 21)    { buckets["2-3 weeks"].count++; buckets["2-3 weeks"].total += r[priceCol]; }
        else                    { buckets[">1 month"].count++;  buckets[">1 month"].total  += r[priceCol]; }
      });

      const avgDelay = relevantRows.length ? (totalDelay / relevantRows.length).toFixed(2) : "0.00";

      results.push({
        year,
        month,
        "Month / Year": `${month}/${year}`,
        "Dining Finances":   dining.toFixed(2),
        "Fiscal Finances":   fiscal.toFixed(2),
        "Absolute Differences": diff.toFixed(2),
        "<1 week Deliveries":     buckets["<1 week"].count,
        "<1 week Total ($)":      buckets["<1 week"].total.toFixed(2),
        "1-2 weeks Deliveries":   buckets["1-2 weeks"].count,
        "1-2 weeks Total ($)":    buckets["1-2 weeks"].total.toFixed(2),
        "2-3 weeks Deliveries":   buckets["2-3 weeks"].count,
        "2-3 weeks Total ($)":    buckets["2-3 weeks"].total.toFixed(2),
        ">1 month Deliveries":    buckets[">1 month"].count,
        ">1 month Total ($)":     buckets[">1 month"].total.toFixed(2),
        "Avg. Processing Delay (days)": avgDelay
      });
    });
  });

  /* 6 ─ build delay-over-time dataset */
  if (allRelevantRows.length === 0) {
    alert("No relevant processing delay data found for the selected months/years.");
    return;
  }

  const delayStoreMonthMap = {};
  allRelevantRows.forEach(r => {
    const store = (r["Store"] || "").toString().trim().toLowerCase() || "unknown";
    const key   = `${r[deliveryDateCol].getFullYear()}-${String(r[deliveryDateCol].getMonth() + 1).padStart(2, "0")}`;
    const delay = Math.floor((r[changedDateCol] - r[deliveryDateCol]) / 86400000);

    delayStoreMonthMap[store] ??= {};
    delayStoreMonthMap[store][key] ??= [];
    delayStoreMonthMap[store][key].push(delay);
  });

  const allMonths = new Set();
  const avgDelayByStore = {};
  for (const store in delayStoreMonthMap) {
    avgDelayByStore[store] = {};
    for (const m in delayStoreMonthMap[store]) {
      const d = delayStoreMonthMap[store][m];
      avgDelayByStore[store][m] = +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(2);
      allMonths.add(m);
    }
  }
  const sortedMonths = Array.from(allMonths).sort();

  const datasets = Object.keys(avgDelayByStore).map(store => ({
    label: store,
    data: sortedMonths.map(m => avgDelayByStore[store][m] ?? null),
    fill: false,
    tension: 0.3
  }));

  const ctx = document.getElementById("delayOverTimeChart").getContext("2d");
  if (window.delayOverTimeChart instanceof Chart) window.delayOverTimeChart.destroy();

  window.delayOverTimeChart = new Chart(ctx, {
    type: "line",
    data: { labels: sortedMonths, datasets },
    options: {
      responsive: true,
      plugins: { title: { display: true, text: "Average Processing Delay by Store Over Time" } },
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Avg Delay (days)" } },
        x: { title: { display: true, text: "Month" } }
      }
    }
  });

  /* 7 ─ render financial tables */
  const outputDiv = document.getElementById("financialResults");
  outputDiv.innerHTML = "";

  results.forEach(res => {
    const table = document.createElement("table");
    table.classList.add("financial-table");

    const title = document.createElement("h3");
    title.textContent = `Financial Analysis for ${res["Month / Year"]}`;
    outputDiv.appendChild(title);

    const keys      = Object.keys(res);
    const mainKeys  = keys.slice(2, 5);
    const delayKeys = keys.slice(5);

    const tr = (k, hdr = false) => {
      const row = document.createElement("tr");
      k.forEach(key => {
        const cell = document.createElement(hdr ? "th" : "td");
        cell.textContent = hdr ? key : res[key];  // key for header, value for data
        row.appendChild(cell);
      });
      return row;
    };

    table.appendChild(tr(mainKeys, true));
    table.appendChild(tr(mainKeys));
    table.appendChild(tr([""], false));      // spacer
    table.appendChild(tr(delayKeys, true));
    table.appendChild(tr(delayKeys));
    outputDiv.appendChild(table);
  });
};
  
  document.getElementById('storeFilterButton').addEventListener('click', applyFilters);

});


