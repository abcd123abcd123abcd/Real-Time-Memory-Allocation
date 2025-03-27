// Global variables
let memoryChart;
let totalMemoryBlocks, blockSize;
let processIDCounter = 1;
let pageSizeBlocks = [];
let allocatedProcesses = {};
let memoryMode = "segmentation"; // Default mode
let pageTable = {}; // For paging mode

$(document).ready(function() {
  try {
    const memoryCtx = document.getElementById('memoryChart').getContext('2d');
        
    const chartConfig = {
      type: 'bar',
      data: {
        labels: ['Initial'],
        datasets: [{
          label: 'Memory Blocks',
          data: [0],
          backgroundColor: ['rgba(200, 200, 200, 0.3)'],
          borderColor: ['rgba(200, 200, 200, 0.5)'],
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            beginAtZero: true,
            max: 1,
            stacked: true
          },
          y: {
            stacked: true,
            grid: {
              display: false // Reduce visual clutter
            },
            ticks: {
              autoSkip: true,
              maxTicksLimit: 20 // Limit the number of ticks shown
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const blockIndex = context.dataIndex;
                const procId = pageSizeBlocks[blockIndex];
                
                if (procId !== null) {
                  const process = allocatedProcesses[procId];
                  return `Process ID: ${procId} - ${process.name} (${blockSize} KB)`;
                } else {
                  return 'Free Block';
                }
              }
            }
          }
        }
      }
    };

    memoryChart = new Chart(memoryCtx, chartConfig);
  } catch (err) {
    console.error("Error initializing chart:", err);
  }

  $('#processManagement').hide();  
  $('#configMemory').on('click', function() {
    updateMemoryConfiguration();
  });

  initializeTheme();
  $('#theme-toggle').on('click', toggleTheme);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('theme')) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      updateChartColors();
    }
  });

  createDiagrams();

  $('#allocationStrategy').wrap('<div id="allocationStrategyContainer"></div>');
});

function updateMemoryConfiguration() {
  try {
    const totalMemorySize = parseInt($('#totalMemory').val());
    const pageSize = parseInt($('#pageSize').val());
    
    memoryMode = $('#memoryMode').val();
    
    if (isNaN(totalMemorySize) || isNaN(pageSize) || totalMemorySize <= 0 || pageSize <= 0) {
      alert("Please enter valid memory and block size values.");
      return false;
    }

    totalMemoryBlocks = Math.floor(totalMemorySize / pageSize);
    blockSize = pageSize;
    
    $('#totalMemoryDisplay').text(totalMemorySize);
    $('#totalBlocksDisplay').text(totalMemoryBlocks);

    resetChart();
    updateMemoryStats();

    if (memoryMode === 'paging') {
      $('#blockTypeLabel').text('Page');
    } else {
      $('#blockTypeLabel').text('Segment');
    }

    $('#processManagement').show();
    $('#configMemory').prop('disabled', true);
    $('#processList').empty();
    addProcessInput();
    return true;
  } catch (err) {
    console.error("Error in memory configuration:", err);
    return false;
  }
}

function addProcessInput() {
  const processId = Date.now();
  
  let inputHtml = `
    <div class="process-container" id="process-${processId}">
      <div class="form-row">
        <label>Process Name:</label>
        <input type="text" class="processName" placeholder="Enter process name">
      </div>
      <div class="form-row">
        <label>Size (KB):</label>
        <input type="number" class="processSize" min="10" placeholder="Enter size in KB">
      </div>`;
      
  if (memoryMode === 'paging') {
    inputHtml += `
      <p class="help-text">This process will be allocated in pages of ${blockSize}KB</p>
      <p class="help-text">Pages required: <span class="pages-required">-</span></p>`;
  } else {
    inputHtml += `
      <p class="help-text">This process will require contiguous blocks of memory</p>`;
  }
  
  inputHtml += `
      <button class="btn btn-danger btn-sm remove-btn" onclick="$('#process-${processId}').remove()">Remove</button>
    </div>`;
  
  $('#processList').append(inputHtml);
  
  if (memoryMode === 'paging') {
    $(`#process-${processId} .processSize`).on('input', function() {
      const size = parseInt($(this).val()) || 0;
      const pagesRequired = Math.ceil(size / blockSize);
      $(`#process-${processId} .pages-required`).text(pagesRequired);
    });
  }
}

function startSimulation() {
  const processNames = $('.processName');
  const processSizes = $('.processSize');
  let processes = [];

  try {
    processNames.each((index, input) => {
      const name = $(input).val().trim() || `Process ${processIDCounter}`;
      const size = parseInt($(processSizes[index]).val());

      if (isNaN(size) || size <= 0) {
        throw new Error('Invalid size value');
      }
      processes.push({ id: processIDCounter++, name, size });
    });
  } catch (error) {
    alert('Please ensure each process has a valid size.');
    return;
  }

  if (processes.length === 0) {
    alert('Please add at least one process.');
    return;
  }

  const strategy = $('#allocationStrategy').val();
  const allocationResult = allocateMemory(processes, strategy);

  if (!allocationResult.success) {
    alert(allocationResult.message);
  } else {
    updateProcessTable();
    updateChart();
    updateMemoryStats();
  }
}

function findFreeContiguousBlocks() {
  const freeBlocks = [];
  let currentRun = 0;
  let startIdx = -1;

  for (let i = 0; i <= pageSizeBlocks.length; i++) {
    if (i < pageSizeBlocks.length && pageSizeBlocks[i] === null) {
      if (currentRun === 0) startIdx = i;
      currentRun++;
    } else {
      if (currentRun > 0) {
        freeBlocks.push({
          start: startIdx,
          size: currentRun,
          end: startIdx + currentRun - 1
        });
        currentRun = 0;
      }
    }
  }

  return freeBlocks;
}

function allocateMemoryPaging(processes) {
  if (!pageSizeBlocks || pageSizeBlocks.length === 0) {
    pageSizeBlocks = new Array(totalMemoryBlocks).fill(null);
  }
  
  const freePageIndices = [];
  for (let i = 0; i < pageSizeBlocks.length; i++) {
    if (pageSizeBlocks[i] === null) {
      freePageIndices.push(i);
    }
  }
  
  for (const proc of processes) {
    const pagesNeeded = Math.ceil(proc.size / blockSize);
    
    if (freePageIndices.length < pagesNeeded) {
      return { 
        success: false, 
        message: `Unable to allocate Process "${proc.name}" (${proc.size}KB). Requires ${pagesNeeded} pages.` 
      };
    }
    
    const pageTableEntry = {
      processId: proc.id,
      virtualPages: [],
      physicalPages: []
    };
    
    for (let i = 0; i < pagesNeeded; i++) {
      const physicalPageIndex = freePageIndices.shift();
      pageSizeBlocks[physicalPageIndex] = proc.id;
      
      pageTableEntry.virtualPages.push(i);
      pageTableEntry.physicalPages.push(physicalPageIndex);
    }
    
    const actualSize = proc.size;
    const allocatedSize = pagesNeeded * blockSize;
    const internalFragmentation = allocatedSize - actualSize;
    
    allocatedProcesses[proc.id] = {
      id: proc.id,
      name: proc.name,
      size: proc.size,
      blocks: pagesNeeded,
      pageTable: pageTableEntry,
      internalFragmentation: internalFragmentation
    };
  }
        
  return { success: true };
}

function allocateMemory(processes, strategy) {
  if (memoryMode === 'paging') {
    return allocateMemoryPaging(processes);
  } else {
    return allocateMemorySegmentation(processes, strategy);
  }
}

function allocateMemorySegmentation(processes, strategy) {
  if (!pageSizeBlocks || pageSizeBlocks.length === 0) {
    pageSizeBlocks = new Array(totalMemoryBlocks).fill(null);
  }
  
  if (!blockSize || blockSize <= 0 || !totalMemoryBlocks || totalMemoryBlocks <= 0) {
    return {
      success: false,
      message: "Memory configuration error. Please set memory and block size first."
    };
  }

  for (const proc of processes) {
    const blocksNeeded = Math.ceil(proc.size / blockSize);
    if (isNaN(blocksNeeded) || blocksNeeded <= 0) {
      return {
        success: false,
        message: `Invalid block calculation for process "${proc.name}".`
      };
    }
    
    const freeBlocks = findFreeContiguousBlocks();
    const candidateBlocks = freeBlocks.filter(block => block.size >= blocksNeeded);
    
    if (candidateBlocks.length === 0) {
      return { 
        success: false, 
        message: `Unable to allocate Process "${proc.name}" (${proc.size}KB).`
      };
    }

    let startIndex = -1;
    
    if (!strategy) strategy = 'firstFit';
    
    if (strategy === 'firstFit') {
      startIndex = candidateBlocks[0].start;
    } 
    else if (strategy === 'bestFit') {
      candidateBlocks.sort((a, b) => a.size - b.size);
      startIndex = candidateBlocks[0].start;
    }
    else if (strategy === 'worstFit') {
      candidateBlocks.sort((a, b) => b.size - a.size);
      startIndex = candidateBlocks[0].start;
    }

    if (startIndex !== -1) {
      for (let j = 0; j < blocksNeeded; j++) {
        pageSizeBlocks[startIndex + j] = proc.id;
      }
      
      allocatedProcesses[proc.id] = {
        id: proc.id,
        name: proc.name,
        size: proc.size,
        blocks: blocksNeeded,
        start: startIndex
      };
    } else {
      return { 
        success: false, 
        message: `Unable to allocate Process "${proc.name}" (ID: ${proc.id}).` 
      };
    }
  }
        
  return { success: true };
}

function resetChart() {
  try {
    pageSizeBlocks = new Array(totalMemoryBlocks).fill(null);
    updateChart();
  } catch (err) {
    console.error("Error in resetChart:", err);
  }
}

function updateChart() {
  try {
    if (!totalMemoryBlocks || totalMemoryBlocks <= 0) {
      return;
    }
    
    const blockLabels = Array.from({ length: totalMemoryBlocks }, (_, i) => {
      const pid = pageSizeBlocks[i];
      if (pid !== null) {
        const proc = allocatedProcesses[pid];
        const blockName = memoryMode === 'paging' ? `Page ${i + 1}` : `Block ${i + 1}`;
        return `${blockName} (P${pid})`;
      }
      return memoryMode === 'paging' ? `Page ${i + 1}` : `Block ${i + 1}`;
    });
    
    const dataPoints = pageSizeBlocks.map(b => b !== null ? 1 : 0);
    
    const backgroundColor = pageSizeBlocks.map(pid => {
      if (pid === null) return 'rgba(240, 240, 240, 0.4)';
      
      const colorPalette = [
        'rgba(52, 152, 219, 0.7)',  // Blue
        'rgba(46, 204, 113, 0.7)',  // Green
        'rgba(155, 89, 182, 0.7)',  // Purple
        'rgba(231, 76, 60, 0.7)',   // Red
        'rgba(241, 196, 15, 0.7)',  // Yellow
        'rgba(230, 126, 34, 0.7)'   // Orange
      ];
        
      return colorPalette[pid % colorPalette.length];
    });
    
    memoryChart.data.labels = blockLabels;
    memoryChart.data.datasets[0].data = dataPoints;
    memoryChart.data.datasets[0].backgroundColor = backgroundColor;
    memoryChart.data.datasets[0].borderColor = backgroundColor.map(color => 
      color.replace('0.7', '1.0')
    );
    memoryChart.data.datasets[0].borderWidth = 1;
    
    memoryChart.update();
  } catch (err) {
    console.error("Error updating chart:", err);
  }
}

function updateProcessTable() {
  const container = $('#allocatedProcesses');
  container.empty();
  
  if (Object.keys(allocatedProcesses).length === 0) {
    container.html('<p>No processes allocated</p>');
    return;
  }
  
  const table = $('<table>').css({
    'width': '100%',
    'border-collapse': 'collapse',
    'margin-top': '10px'
  });
  
  const thead = $('<thead>').appendTo(table);
  $('<tr>').html(`
    <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Process ID</th>
    <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Name</th>
    <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Size (KB)</th>
    <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Blocks</th>
    <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Start Block</th>
    <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Actions</th>
  `).appendTo(thead);

  const tbody = $('<tbody>').appendTo(table);
  
  for (const pid in allocatedProcesses) {
    const proc = allocatedProcesses[pid];
    const row = $('<tr>').appendTo(tbody);
    
    $('<td>').text(proc.id).css('padding', '8px').appendTo(row);
    $('<td>').text(proc.name).css('padding', '8px').appendTo(row);
    $('<td>').text(proc.size).css('padding', '8px').appendTo(row);
    $('<td>').text(proc.blocks).css('padding', '8px').appendTo(row);
    $('<td>').text(proc.start + 1).css('padding', '8px').appendTo(row);
    
    const actionCell = $('<td>').css('padding', '8px').appendTo(row);
    $('<button>').text('Deallocate')
      .css({
        'background-color': '#dc3545',
        'color': 'white',
        'border': 'none',
        'border-radius': '3px',
        'padding': '5px 10px',
        'cursor': 'pointer'
      })
      .on('click', function() {
        deallocateProcess(proc.id);
      })
      .appendTo(actionCell);
  }
        
  container.append(table);
}

function deallocateProcess(processId) {
  if (allocatedProcesses[processId]) {
    for (let i = 0; i < pageSizeBlocks.length; i++) {
      if (pageSizeBlocks[i] === processId) {
        pageSizeBlocks[i] = null;
      }
    }
    
    delete allocatedProcesses[processId];
    
    updateChart();
    updateProcessTable();
    updateMemoryStats();
  }
}

function calculateFragmentation() {
  const totalMemory = parseInt($('#totalMemory').val());
  
  if (memoryMode === 'paging') {
    let internalFragmentation = 0;
    
    for (const pid in allocatedProcesses) {
      const proc = allocatedProcesses[pid];
      const actualSize = proc.size;
      const allocatedSize = proc.blocks * blockSize;
      internalFragmentation += (allocatedSize - actualSize);
    }
    
    $('#internalFragmentation').text(internalFragmentation);
  } else {
    const freeBlocks = findFreeContiguousBlocks();
    const totalFreeMemory = freeBlocks.reduce((sum, block) => sum + (block.size * blockSize), 0);
    
    let largestBlock = 0;
    if (freeBlocks.length > 0) {
      largestBlock = Math.max(...freeBlocks.map(block => block.size)) * blockSize;
    }
     
    const externalFragmentation = totalFreeMemory - largestBlock;
    $('#externalFragmentation').text(externalFragmentation);
  }
}

function updateMemoryStats() {
  const totalMemory = parseInt($('#totalMemory').val());
  const usedBlocks = pageSizeBlocks.filter(b => b !== null).length;
  const usedMemory = usedBlocks * blockSize;
  const freeMemory = totalMemory - usedMemory;
  
  const usedPercent = ((usedMemory / totalMemory) * 100).toFixed(1);
  const freePercent = ((freeMemory / totalMemory) * 100).toFixed(1);
  
  $('#usedMemoryDisplay').text(usedMemory);
  $('#usedMemoryPercentDisplay').text(usedPercent);
  $('#freeMemoryDisplay').text(freeMemory);
  $('#freeMemoryPercentDisplay').text(freePercent);
  
  calculateFragmentation();
  
  if (usedPercent > 90) {
    $('#usedMemoryDisplay').closest('.stat-box').addClass('warning');
  } else {
    $('#usedMemoryDisplay').closest('.stat-box').removeClass('warning');
  }
}

function switchMemoryMode(mode) {
  resetSimulation();
  
  $('.tab').removeClass('active');
  $(`.tab[data-mode="${mode}"]`).addClass('active');
  
  memoryMode = mode;
  
  if (mode === 'paging') {
    $('#pagingConfig').show();
    $('#segmentationConfig').hide();
    $('#pagingInfo').show();
    $('#segmentationInfo').hide();
    $('#allocationStrategyContainer').hide();
    
    $('#allocationHelp').html(`
      <div class="info-box">
        <h4>Paging Allocation</h4>
        <p>In paging, memory is divided into fixed-size pages.</p>
      </div>
    `);
  } else {
    $('#pagingConfig').hide();
    $('#segmentationConfig').show();
    $('#pagingInfo').hide();
    $('#segmentationInfo').show();
    $('#allocationStrategyContainer').show();
    
    $('#allocationHelp').html(`
      <div class="info-box">
        <h4>Segmentation Allocation</h4>
        <p>Segmentation requires contiguous blocks.</p>
      </div>
    `);
  }
  
  if ($('.visualization-tabs .tab[data-viz="tables"]').hasClass('active')) {
    if (mode === 'paging') {
      $('#pageTableView').show();
      $('#segmentTableView').hide();
      updatePageTable();
    } else {
      $('#pageTableView').hide();
      $('#segmentTableView').show();
      updateSegmentTable();
    }
  }
}

function switchVisualization(mode) {
  $('.visualization-tabs .tab').removeClass('active');
  $(`.visualization-tabs .tab[data-viz="${mode}"]`).addClass('active');
  
  $('.visualization-panel').hide();
  
  switch (mode) {
    case 'blocks':
      $('#blocksVisualization').show();
      break;
    case 'tables':
      $('#tablesVisualization').show();
      if (memoryMode === 'paging') {
        $('#pageTableView').show();
        $('#segmentTableView').hide();
        updatePageTable();
      } else {
        $('#segmentTableView').show();
        $('#pageTableView').hide();
        updateSegmentTable();
      }
      break;
    case 'compare':
      $('#compareVisualization').show();
      break;
  }
}

function updatePageTable() {
  const container = $('#pageTableContainer');
  container.empty();
  
  if (Object.keys(allocatedProcesses).length === 0) {
    container.html('<p>No processes allocated</p>');
    return;
  }
  
  const table = $('<table>').addClass('page-table');
  
  const thead = $('<thead>').appendTo(table);
  $('<tr>').html(`
    <th>Process</th>
    <th>Virtual Page #</th>
    <th>Physical Page #</th>
    <th>Size</th>
    <th>Utilization</th>
  `).appendTo(thead);
  
  const tbody = $('<tbody>').appendTo(table);
  
  for (const pid in allocatedProcesses) {
    const proc = allocatedProcesses[pid];
    
    if (proc.pageTable) {
      for (let i = 0; i < proc.pageTable.virtualPages.length; i++) {
        const virtualPage = proc.pageTable.virtualPages[i];
        const physicalPage = proc.pageTable.physicalPages[i];
        
        let utilization = '100%';
        let pageSize = blockSize;
        
        if (i === proc.pageTable.virtualPages.length - 1) {
          const remainingBytes = proc.size - (proc.pageTable.virtualPages.length - 1) * blockSize;
          utilization = Math.round((remainingBytes / blockSize) * 100) + '%';
          
          if (remainingBytes < blockSize) {
            pageSize = remainingBytes;
          }
        }
        
        const row = $('<tr>').appendTo(tbody);
        row.html(`
          <td>${proc.name} (ID: ${proc.id})</td>
          <td>${virtualPage}</td>
          <td>${physicalPage}</td>
          <td>${pageSize} KB</td>
          <td class="utilization-cell">
            <div class="utilization-bar">
              <div class="utilization-fill" style="width: ${utilization}"></div>
              <span>${utilization}</span>
            </div>
          </td>
        `);
      }
    }
  }
  
  container.append(table);
  
  let totalFragmentation = 0;
  for (const pid in allocatedProcesses) {
    const proc = allocatedProcesses[pid];
    if (proc.internalFragmentation) {
      totalFragmentation += proc.internalFragmentation;
    }
  }
  
  container.append(`
    <div class="fragmentation-info">
      <h4>Total Internal Fragmentation: ${totalFragmentation} KB</h4>
      <p>This is the sum of wasted space in the last page of each process.</p>
    </div>
  `);
}

function updateSegmentTable() {
  const container = $('#segmentTableContainer');
  container.empty();
  
  if (Object.keys(allocatedProcesses).length === 0) {
    container.html('<p>No processes allocated</p>');
    return;
  }
  
  const table = $('<table>').addClass('segment-table');
  
  const thead = $('<thead>').appendTo(table);
  $('<tr>').html(`
    <th>Process</th>
    <th>Segment #</th>
    <th>Base Address</th>
    <th>Limit (Size)</th>
  `).appendTo(thead);
  
  const tbody = $('<tbody>').appendTo(table);
  
  for (const pid in allocatedProcesses) {
    const proc = allocatedProcesses[pid];
    const baseAddress = proc.start * blockSize;
    const limit = proc.blocks * blockSize;
    
    const row = $('<tr>').appendTo(tbody);
    row.html(`
      <td>${proc.name} (ID: ${proc.id})</td>
      <td>0</td>
      <td>${baseAddress} KB</td>
      <td>${limit} KB</td>
    `);
  }
  
  container.append(table);
  
  const freeBlocks = findFreeContiguousBlocks();
  const memoryMap = $('<div>').addClass('memory-map');
  
  memoryMap.append('<h4>Memory Map</h4>');
  
  const memoryBar = $('<div>').addClass('memory-bar');
  
  let currentIndex = 0;
  while (currentIndex < pageSizeBlocks.length) {
    const pid = pageSizeBlocks[currentIndex];
    
    if (pid !== null) {
      let blockCount = 1;
      while (currentIndex + blockCount < pageSizeBlocks.length && 
             pageSizeBlocks[currentIndex + blockCount] === pid) {
        blockCount++;
      }
      
      const proc = allocatedProcesses[pid];
      const procName = proc ? proc.name : 'Unknown';
      const procSize = blockCount * blockSize;
      
      const procBlock = $('<div>').addClass('memory-segment allocated');
      procBlock.css('width', (blockCount / pageSizeBlocks.length * 100) + '%');
      procBlock.html(`<span>Process ${pid}: ${procName} (${procSize}KB)</span>`);
      memoryBar.append(procBlock);
      
      currentIndex += blockCount;
    } else {
      let blockCount = 1;
      while (currentIndex + blockCount < pageSizeBlocks.length && 
             pageSizeBlocks[currentIndex + blockCount] === null) {
        blockCount++;
      }
      
      const freeBlock = $('<div>').addClass('memory-segment free');
      freeBlock.css('width', (blockCount / pageSizeBlocks.length * 100) + '%');
      freeBlock.html(`<span>Free (${blockCount * blockSize}KB)</span>`);
      memoryBar.append(freeBlock);
         
      currentIndex += blockCount;
    }
  }
  
  memoryMap.append(memoryBar);
  
  const freeBlockSizes = freeBlocks.map(block => block.size * blockSize);
  const totalFree = freeBlockSizes.reduce((sum, size) => sum + size, 0);
  const largestFree = freeBlockSizes.length > 0 ? Math.max(...freeBlockSizes) : 0;
  const externalFragmentation = totalFree - largestFree;
  
  memoryMap.append(`
    <div class="fragmentation-info">
      <h4>External Fragmentation: ${externalFragmentation} KB</h4>
      <p>Total free memory: ${totalFree} KB, but largest contiguous block is only ${largestFree} KB.</p>
      <p>This means ${externalFragmentation} KB is unusable for processes requiring contiguous allocation.</p>
    </div>
  `);
        
  container.append(memoryMap);
}

function initializeTheme() {
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else if (systemPrefersDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  
  if (memoryChart) {
    updateChartColors();
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
   
  updateChartColors();
}

function updateChartColors() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const textColor = currentTheme === 'dark' ? '#e0e0e0' : '#333';
  const gridColor = currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  
  if (memoryChart && memoryChart.options) {
    const chartVersion = Chart.version ? parseFloat(Chart.version) : null;
    
    if (chartVersion && chartVersion >= 3) {
      if (memoryChart.options.scales.y && memoryChart.options.scales.y.ticks) {
        memoryChart.options.scales.y.ticks.color = textColor;
      }
      if (memoryChart.options.scales.x && memoryChart.options.scales.x.ticks) {
        memoryChart.options.scales.x.ticks.color = textColor;
      }
      if (memoryChart.options.scales.y && memoryChart.options.scales.y.grid) {
        memoryChart.options.scales.y.grid.color = gridColor;
      }
      if (memoryChart.options.scales.x && memoryChart.options.scales.x.grid) {
        memoryChart.options.scales.x.grid.color = gridColor;
      }
    } else {
      if (memoryChart.options.scales && memoryChart.options.scales.yAxes) {
        memoryChart.options.scales.yAxes.forEach(axis => {
          if (axis.ticks) axis.ticks.fontColor = textColor;
          if (axis.gridLines) axis.gridLines.color = gridColor;
        });
      }
      if (memoryChart.options.scales && memoryChart.options.scales.xAxes) {
        memoryChart.options.scales.xAxes.forEach(axis => {
          if (axis.ticks) axis.ticks.fontColor = textColor;
          if (axis.gridLines) axis.gridLines.color = gridColor;
        });
      }
    }
     
    memoryChart.update();
  }
}

function createDiagrams() {
  const segmentationSVG = `<svg width="300" height="200" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="10" width="280" height="40" fill="#4fa3e3" stroke="#2c3e50" />
    <text x="150" y="35" text-anchor="middle" fill="white">Process A</text>
    <rect x="10" y="60" width="100" height="30" fill="#f39c12" stroke="#2c3e50" />
    <text x="60" y="80" text-anchor="middle" fill="white">Process B</text>
    <rect x="120" y="60" width="50" height="30" fill="#e74c3c" stroke="#2c3e50" />
    <text x="145" y="80" text-anchor="middle" fill="white">C</text>
    <rect x="180" y="60" width="110" height="30" fill="#2ecc71" stroke="#2c3e50" />
    <text x="235" y="80" text-anchor="middle" fill="white">Process D</text>
    <rect x="10" y="100" width="280" height="30" fill="#9b59b6" stroke="#2c3e50" />
    <text x="150" y="120" text-anchor="middle" fill="white">Process E</text>
    <rect x="10" y="140" width="180" height="30" fill="#f1c40f" stroke="#2c3e50" />
    <text x="100" y="160" text-anchor="middle" fill="white">Process F</text>
    <rect x="200" y="140" width="90" height="30" fill="#e67e22" stroke="#2c3e50" />
    <text x="245" y="160" text-anchor="middle" fill="white">Process G</text>
  </svg>`;
  
  const pagingSVG = `<svg width="300" height="200" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="10" width="50" height="50" fill="#4fa3e3" stroke="#2c3e50" />
    <text x="35" y="40" text-anchor="middle" fill="white">A1</text>
    <rect x="70" y="10" width="50" height="50" fill="#f39c12" stroke="#2c3e50" />
    <text x="95" y="40" text-anchor="middle" fill="white">B1</text>
    <rect x="130" y="10" width="50" height="50" fill="#f1c40f" stroke="#2c3e50" />
    <text x="155" y="40" text-anchor="middle" fill="white">C1</text>
    <rect x="190" y="10" width="50" height="50" fill="#2ecc71" stroke="#2c3e50" />
    <text x="215" y="40" text-anchor="middle" fill="white">D1</text>
    <rect x="250" y="10" width="50" height="50" fill="#9b59b6" stroke="#2c3e50" />
    <text x="275" y="40" text-anchor="middle" fill="white">E1</text>
    <rect x="10" y="70" width="50" height="50" fill="#4fa3e3" stroke="#2c3e50" />
    <text x="35" y="100" text-anchor="middle" fill="white">A2</text>
    <rect x="70" y="70" width="50" height="50" fill="#e74c3c" stroke="#2c3e50" />
    <text x="95" y="100" text-anchor="middle" fill="white">F1</text>
    <rect x="130" y="70" width="50" height="50" fill="#f1c40f" stroke="#2c3e50" />
    <text x="155" y="100" text-anchor="middle" fill="white">C2</text>
    <rect x="190" y="70" width="50" height="50" fill="#2ecc71" stroke="#2c3e50" />
    <text x="215" y="100" text-anchor="middle" fill="white">D2</text>
    <rect x="250" y="70" width="50" height="50" fill="#e67e22" stroke="#2c3e50" />
    <text x="275" y="100" text-anchor="middle" fill="white">G1</text>
  </svg>`;
  
  document.querySelector('#compareVisualization .comparison-column:first-child .comparison-image')
            .innerHTML = segmentationSVG;
  document.querySelector('#compareVisualization .comparison-column:last-child .comparison-image')
            .innerHTML = pagingSVG;
}
