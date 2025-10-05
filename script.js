document.addEventListener('DOMContentLoaded', () => {
    // 전역 변수
    let processedData = {};
    let frequencyData = [];
    let fileNames = [];
    let charts = {};

    // DOM 요소
    const csvFilesInput = document.getElementById('csvFiles');
    const processBtn = document.getElementById('processBtn');
    const plotBtn = document.getElementById('plotBtn');
    const exportBtn = document.getElementById('exportBtn');
    const themeToggle = document.getElementById('theme-toggle');

    // 테마 설정
    const sunIcon = `☀️`;
    const moonIcon = `🌙`;
    function setTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        themeToggle.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
        localStorage.setItem('theme', theme);
        // 테마 변경 시 차트 다시 그리기
        if (Object.keys(charts).length > 0) {
            plotGraphs();
        }
    }
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.body.getAttribute('data-theme');
        setTheme(currentTheme === 'light' ? 'dark' : 'light');
    });
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);

    // 파일 선택 이벤트
    csvFilesInput.addEventListener('change', handleFiles);

    function handleFiles(event) {
        const files = event.target.files;
        if (files.length === 0) return;

        const skipRows = parseInt(document.getElementById('skipRows').value) || 6;
        const maxRows = parseInt(document.getElementById('maxRows').value) || 1001;

        showStatus(`Reading files... (Auto-detecting BEGIN/END or skipping ${skipRows} rows, processing ${maxRows} rows)`, 'info');
        
        fileNames = [];
        processedData = {};
        let processedCount = 0;
        const totalFiles = files.length;

        Array.from(files).forEach((file, index) => {
            const fileName = file.name.replace('.csv', '');
            fileNames.push(fileName);

            Papa.parse(file, {
                header: false,
                skipEmptyLines: true,
                encoding: 'UTF-8',
                complete: function(results) {
                    try {
                        let beginIndex = -1, endIndex = -1, headerIndex = -1;
                        for (let i = 0; i < results.data.length; i++) {
                            const firstCell = String(results.data[i][0]).trim().toUpperCase();
                            if (firstCell === 'BEGIN') beginIndex = i;
                            if (firstCell === 'END') { endIndex = i; break; }
                            if (beginIndex >= 0 && headerIndex === -1 && (firstCell.toLowerCase().includes('freq') || firstCell.includes('Hz'))) {
                                headerIndex = i;
                            }
                        }

                        let dataStartIndex, dataEndIndex;
                        if (beginIndex !== -1) {
                            dataStartIndex = (headerIndex !== -1) ? headerIndex + 1 : beginIndex + 1;
                            dataEndIndex = (endIndex !== -1) ? endIndex : dataStartIndex + maxRows;
                        } else {
                            dataStartIndex = skipRows;
                            dataEndIndex = skipRows + maxRows;
                        }
                        dataEndIndex = Math.min(dataEndIndex, results.data.length);

                        const headers = results.data[dataStartIndex - 1] || [];
                        const rows = results.data.slice(dataStartIndex, dataEndIndex);

                        const findIndex = (candidates) => {
                            for (let i = 0; i < headers.length; i++) {
                                const header = String(headers[i]).trim().toLowerCase();
                                if (candidates.some(c => header.includes(c))) return i;
                            }
                            return -1;
                        };

                        const freqIndex = findIndex(['freq', 'hz']);
                        const s11Index = findIndex(['s11', 'db(s(1,1))']);
                        const s21Index = findIndex(['s21', 'db(s(2,1))']);

                        if (freqIndex === -1 || s11Index === -1 || s21Index === -1) {
                            throw new Error(`Required columns (Freq, S11, S21) not found in ${fileName}. Found: ${headers.join(', ')}`);
                        }

                        const data = rows.map(row => ({
                            freq: parseFloat(row[freqIndex]),
                            s11: parseFloat(row[s11Index]),
                            s21: parseFloat(row[s21Index])
                        })).filter(item => !isNaN(item.freq) && item.freq > 0);

                        if (data.length === 0) throw new Error(`No valid data found in ${fileName}`);
                        
                        processedData[fileName] = data;
                        if (index === 0) {
                            frequencyData = data.map(item => item.freq);
                        }

                        processedCount++;
                        if (processedCount === totalFiles) {
                            showFileList();
                            showStatus(`${totalFiles} files loaded successfully.`, 'success');
                            processBtn.disabled = false;
                        }
                    } catch (error) {
                        showStatus(`Error processing ${fileName}: ${error.message}`, 'error');
                    }
                }
            });
        });
    }

    window.showFileList = function showFileList() {
        const fileListDiv = document.getElementById('fileList');
        const filesDiv = document.getElementById('files');
        filesDiv.innerHTML = '';
        fileNames.forEach(name => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `<span>📄 ${name}</span><span>${processedData[name]?.length || 0} data points</span>`;
            filesDiv.appendChild(fileItem);
        });
        fileListDiv.style.display = 'block';
    }

    window.processData = function processData() {
        const refName = document.getElementById('refName').value.trim();
        if (!processedData[refName]) {
            return showStatus(`Reference file '${refName}' not found.`, 'error');
        }
        showStatus('Processing data...', 'info');

        try {
            const refData = processedData[refName];
            const refValues = refData.map(item => item.s21 - (10 * Math.log10(1 - Math.pow(10, item.s11 / 10))));

            window.compensatedS21Data = {};
            Object.keys(processedData).forEach(fileName => {
                const fileData = processedData[fileName];
                window.compensatedS21Data[fileName] = fileData.map((item, index) => {
                    const correction = 10 * Math.log10(1 - Math.pow(10, item.s11 / 10));
                    return refValues[index] - item.s21 + correction;
                });
            });

            showStatus('Data processed successfully.', 'success');
            plotBtn.disabled = false;
            exportBtn.disabled = false;
        } catch (error) {
            showStatus(`Processing error: ${error.message}`, 'error');
        }
    }
    
    window.plotGraphs = function plotGraphs() {
        showStatus('Generating charts...', 'info');
        document.getElementById('charts-section').style.display = 'grid';
        Object.values(charts).forEach(chart => chart.destroy());
        
        const frequencyGHz = frequencyData.map(f => (f / 1e9).toFixed(3));
        const refName = document.getElementById('refName').value.trim();

        const rawS21Datasets = fileNames.map((name, index) => ({
            label: name,
            data: processedData[name].map(item => item.s21),
            borderColor: getColor(index),
            borderWidth: 2, fill: false, pointRadius: 0
        }));

        const compensatedS21Datasets = fileNames.filter(name => name !== refName).map((name, index) => ({
            label: name,
            data: window.compensatedS21Data[name],
            borderColor: getColor(index),
            borderWidth: 2, fill: false, pointRadius: 0
        }));

        charts.rawS21 = new Chart(document.getElementById('rawS21Chart'), {
            type: 'line', data: { labels: frequencyGHz, datasets: rawS21Datasets }, options: getChartOptions('Frequency (GHz)', 'S21 (dB)')
        });
        charts.compensatedS21 = new Chart(document.getElementById('compensatedS21Chart'), {
            type: 'line', data: { labels: frequencyGHz, datasets: compensatedS21Datasets }, options: getChartOptions('Frequency (GHz)', 'Compensated S21 (dB)')
        });
        showStatus('Charts generated.', 'success');
    }
    
    function getChartOptions(xLabel, yLabel) {
        const isDarkMode = document.body.getAttribute('data-theme') === 'dark';
        const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const textColor = isDarkMode ? '#f1f5f9' : '#0f172a';

        return {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: textColor, usePointStyle: true, padding: 20 } } },
            scales: {
                x: { display: true, title: { display: true, text: xLabel, color: textColor }, grid: { color: gridColor }, ticks: { color: textColor } },
                y: { display: true, title: { display: true, text: yLabel, color: textColor }, grid: { color: gridColor }, ticks: { color: textColor } }
            },
            interaction: { intersect: false, mode: 'index' },
        };
    }
    
    function getColor(index) {
        const colors = ['#2563eb', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#8b5cf6'];
        return colors[index % colors.length];
    }
    
    window.exportData = function exportData() {
        if (!window.compensatedS21Data) return showStatus('No data to export.', 'error');
        showStatus('Exporting to CSV...', 'info');

        const refName = document.getElementById('refName').value.trim();
        const dataKeys = Object.keys(window.compensatedS21Data).filter(name => name !== refName);
        let csvContent = 'Frequency(Hz),' + dataKeys.map(name => `${name}_CompensatedS21(dB)`).join(',') + '\n';
        
        frequencyData.forEach((freq, i) => {
            const row = [freq, ...dataKeys.map(name => window.compensatedS21Data[name][i]?.toFixed(6) || '')];
            csvContent += row.join(',') + '\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'Compensated_S21_Analysis.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showStatus('CSV file downloaded.', 'success');
    }

    window.clearAll = function clearAll() {
        processedData = {}; frequencyData = []; fileNames = []; window.compensatedS21Data = null;
        csvFilesInput.value = '';
        document.getElementById('fileList').style.display = 'none';
        document.getElementById('charts-section').style.display = 'none';
        document.getElementById('status').style.display = 'none';
        processBtn.disabled = true; plotBtn.disabled = true; exportBtn.disabled = true;
        Object.values(charts).forEach(chart => chart.destroy()); charts = {};
    }
    
    window.showStatus = function showStatus(message, type) {
        const statusDiv = document.getElementById('status');
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
    }
});
