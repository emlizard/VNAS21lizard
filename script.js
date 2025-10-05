document.addEventListener('DOMContentLoaded', () => {
    // App 객체로 코드 구조화
    const App = {
        // 상태 변수
        processedData: {},
        frequencyData: [],
        fileNames: [],
        charts: {},

        // DOM 요소 캐싱
        elements: {
            csvFiles: document.getElementById('csvFiles'),
            refName: document.getElementById('refName'),
            skipRows: document.getElementById('skipRows'),
            maxRows: document.getElementById('maxRows'),
            processBtn: document.getElementById('processBtn'),
            plotBtn: document.getElementById('plotBtn'),
            exportBtn: document.getElementById('exportBtn'),
            clearBtn: document.getElementById('clearBtn'),
            status: document.getElementById('status'),
            fileList: document.getElementById('fileList'),
            files: document.getElementById('files'),
            chartsSection: document.getElementById('charts-section'),
            rawS21Chart: document.getElementById('rawS21Chart'),
            compensatedS21Chart: document.getElementById('compensatedS21Chart'),
            themeToggle: document.getElementById('theme-toggle'),
        },

        init() {
            this.initTheme();
            this.initEventListeners();
        },

        initTheme() {
            const sunIcon = `☀️`;
            const moonIcon = `🌙`;
            const setTheme = (theme) => {
                document.body.setAttribute('data-theme', theme);
                this.elements.themeToggle.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
                localStorage.setItem('theme', theme);
                if (Object.keys(this.charts).length > 0) {
                    this.plotGraphs();
                }
            };

            this.elements.themeToggle.addEventListener('click', () => {
                const currentTheme = document.body.getAttribute('data-theme');
                setTheme(currentTheme === 'light' ? 'dark' : 'light');
            });

            const savedTheme = localStorage.getItem('theme') || 'light';
            setTheme(savedTheme);
        },

        initEventListeners() {
            this.elements.csvFiles.addEventListener('change', this.handleFiles.bind(this));
            this.elements.processBtn.addEventListener('click', this.processData.bind(this));
            this.elements.plotBtn.addEventListener('click', this.plotGraphs.bind(this));
            this.elements.exportBtn.addEventListener('click', this.exportData.bind(this));
            this.elements.clearBtn.addEventListener('click', this.clearAll.bind(this));
        },

        handleFiles(event) {
            const files = event.target.files;
            if (files.length === 0) return;

            this.clearAll(true); // 이전 데이터 초기화 (UI 제외)
            this.showStatus(`Reading ${files.length} files...`, 'info');
            
            let processedCount = 0;
            let successfulFiles = 0;

            // [FIX] 모든 파일 처리 완료 후 실행될 함수
            const onAllFilesProcessed = () => {
                processedCount++;
                if (processedCount === files.length) {
                    this.showFileList();
                    if (successfulFiles > 0) {
                        this.showStatus(`${successfulFiles} of ${files.length} files loaded successfully. Ready to process.`, 'success');
                        this.elements.processBtn.disabled = false;
                    } else {
                        this.showStatus(`Failed to load any valid data from ${files.length} files. Please check file format.`, 'error');
                    }
                }
            };

            Array.from(files).forEach((file, index) => {
                const fileName = file.name.replace('.csv', '');
                
                Papa.parse(file, {
                    header: false, skipEmptyLines: true, encoding: 'UTF-8',
                    error: (error) => {
                        console.error(`PapaParse error on ${file.name}:`, error);
                        onAllFilesProcessed(); // 실패해도 카운트
                    },
                    complete: (results) => {
                        try {
                            this.fileNames.push(fileName);
                            const data = this.parseFileData(results.data, fileName);
                            if (data.length === 0) throw new Error(`No valid data points found.`);
                            
                            this.processedData[fileName] = data;
                            if (Object.keys(this.processedData).length === 1) { // 첫번째 성공한 파일 기준
                                this.frequencyData = data.map(item => item.freq);
                            }
                            successfulFiles++;
                        } catch (error) {
                            this.showStatus(`Error in ${fileName}: ${error.message}`, 'error');
                        } finally {
                            onAllFilesProcessed(); // 성공/실패 모두 카운트
                        }
                    }
                });
            });
        },

        parseFileData(data, fileName) {
            let beginIndex = -1, endIndex = -1, headerIndex = -1;
            for (let i = 0; i < data.length; i++) {
                const firstCell = String(data[i][0]).trim().toUpperCase();
                if (firstCell === 'BEGIN') beginIndex = i;
                if (firstCell === 'END') { endIndex = i; break; }
                if (beginIndex >= 0 && headerIndex === -1 && (firstCell.toLowerCase().includes('freq') || firstCell.includes('Hz'))) {
                    headerIndex = i;
                }
            }
            
            let dataStartIndex, dataEndIndex;
            const skipRows = parseInt(this.elements.skipRows.value);
            const maxRows = parseInt(this.elements.maxRows.value);
            if (beginIndex !== -1) {
                dataStartIndex = (headerIndex !== -1) ? headerIndex + 1 : beginIndex + 1;
                dataEndIndex = (endIndex !== -1) ? endIndex : dataStartIndex + maxRows;
            } else {
                dataStartIndex = skipRows;
                dataEndIndex = skipRows + maxRows;
            }
            dataEndIndex = Math.min(dataEndIndex, data.length);

            const headers = data[dataStartIndex - 1] || [];
            const rows = data.slice(dataStartIndex, dataEndIndex);

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
                throw new Error(`Required columns not found. (Need Freq, S11, S21)`);
            }

            return rows.map(row => ({
                freq: parseFloat(row[freqIndex]),
                s11: parseFloat(row[s11Index]),
                s21: parseFloat(row[s21Index])
            })).filter(item => !isNaN(item.freq) && item.freq > 0);
        },
        
        showFileList() {
            this.elements.files.innerHTML = '';
            this.fileNames.forEach(name => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                const status = this.processedData[name] ? `${this.processedData[name].length} data points` : 'Load Failed';
                fileItem.innerHTML = `<span>📄 ${name}</span><span>${status}</span>`;
                this.elements.files.appendChild(fileItem);
            });
            this.elements.fileList.style.display = 'block';
        },
        
        processData() {
            this.elements.processBtn.disabled = true;
            this.elements.processBtn.innerHTML = '🔄 Processing...';
            
            // setTimeout을 사용하여 UI가 먼저 업데이트되도록 함
            setTimeout(() => {
                const refName = this.elements.refName.value.trim();
                if (!this.processedData[refName]) {
                    this.elements.processBtn.innerHTML = '🔄 Process Data';
                    return this.showStatus(`Reference file '${refName}' not found.`, 'error');
                }
                this.showStatus('Processing data...', 'info');

                try {
                    const refData = this.processedData[refName];
                    const refValues = refData.map(item => item.s21 - (10 * Math.log10(1 - Math.pow(10, item.s11 / 10))));

                    this.compensatedS21Data = {};
                    Object.keys(this.processedData).forEach(fileName => {
                        const fileData = this.processedData[fileName];
                        this.compensatedS21Data[fileName] = fileData.map((item, index) => {
                            const correction = 10 * Math.log10(1 - Math.pow(10, item.s11 / 10));
                            return refValues[index] - item.s21 + correction;
                        });
                    });

                    this.showStatus('Data processed successfully. Ready to plot.', 'success');
                    this.elements.plotBtn.disabled = false;
                    this.elements.exportBtn.disabled = false;
                } catch (error) {
                    this.showStatus(`Processing error: ${error.message}`, 'error');
                } finally {
                    this.elements.processBtn.innerHTML = '🔄 Process Data';
                }
            }, 10);
        },
        
        plotGraphs() {
            this.elements.plotBtn.disabled = true;
            this.elements.plotBtn.innerHTML = '📊 Plotting...';

            setTimeout(() => {
                try {
                    this.showStatus('Generating charts...', 'info');
                    this.elements.chartsSection.style.display = 'grid';
                    Object.values(this.charts).forEach(chart => chart.destroy());
                    
                    const frequencyGHz = this.frequencyData.map(f => (f / 1e9).toFixed(3));
                    const refName = this.elements.refName.value.trim();

                    const rawS21Datasets = Object.keys(this.processedData).map((name, index) => ({
                        label: name, data: this.processedData[name].map(item => item.s21),
                        borderColor: this.getColor(index), borderWidth: 2, fill: false, pointRadius: 0
                    }));

                    const compensatedS21Datasets = Object.keys(this.compensatedS21Data).filter(name => name !== refName).map((name, index) => ({
                        label: name, data: this.compensatedS21Data[name],
                        borderColor: this.getColor(index), borderWidth: 2, fill: false, pointRadius: 0
                    }));

                    this.charts.rawS21 = new Chart(this.elements.rawS21Chart, {
                        type: 'line', data: { labels: frequencyGHz, datasets: rawS21Datasets }, options: this.getChartOptions('Frequency (GHz)', 'S21 (dB)')
                    });
                    this.charts.compensatedS21 = new Chart(this.elements.compensatedS21Chart, {
                        type: 'line', data: { labels: frequencyGHz, datasets: compensatedS21Datasets }, options: this.getChartOptions('Frequency (GHz)', 'Compensated S21 (dB)')
                    });
                    this.showStatus('Charts generated.', 'success');
                } catch(e) {
                    this.showStatus(`Failed to plot charts: ${e.message}`, 'error');
                } finally {
                    this.elements.plotBtn.disabled = false;
                    this.elements.plotBtn.innerHTML = '📊 Plot Charts';
                }
            }, 10);
        },

        getChartOptions(xLabel, yLabel) {
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
        },
        
        getColor(index) {
            const colors = ['#2563eb', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#8b5cf6'];
            return colors[index % colors.length];
        },
        
        exportData() {
            if (!this.compensatedS21Data) return this.showStatus('No data to export.', 'error');
            this.showStatus('Exporting to CSV...', 'info');
            try {
                const refName = this.elements.refName.value.trim();
                const dataKeys = Object.keys(this.compensatedS21Data).filter(name => name !== refName);
                let csvContent = 'Frequency(Hz),' + dataKeys.map(name => `${name}_CompensatedS21(dB)`).join(',') + '\n';
                
                this.frequencyData.forEach((freq, i) => {
                    const row = [freq, ...dataKeys.map(name => this.compensatedS21Data[name][i]?.toFixed(6) || '')];
                    csvContent += row.join(',') + '\n';
                });

                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.setAttribute('download', 'Compensated_S21_Analysis.csv');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                this.showStatus('CSV file downloaded.', 'success');
            } catch(e) {
                this.showStatus(`Failed to export: ${e.message}`, 'error');
            }
        },

        clearAll(keepUI = false) {
            this.processedData = {}; this.frequencyData = []; this.fileNames = []; this.compensatedS21Data = null;
            Object.values(this.charts).forEach(chart => chart.destroy()); this.charts = {};
            
            if (keepUI) return;

            this.elements.csvFiles.value = '';
            this.elements.fileList.style.display = 'none';
            this.elements.chartsSection.style.display = 'none';
            this.elements.status.style.display = 'none';
            this.elements.processBtn.disabled = true; 
            this.elements.plotBtn.disabled = true; 
            this.elements.exportBtn.disabled = true;
        },

        showStatus(message, type) {
            const statusDiv = this.elements.status;
            statusDiv.textContent = message;
            statusDiv.className = `status ${type}`;
            statusDiv.style.display = 'block';
        },
    };

    App.init();
});
