import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import Calendar from "sap/ui/unified/Calendar";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Event from "sap/ui/base/Event";
import VizFrame from "sap/viz/ui5/controls/VizFrame";
import MultiComboBox from "sap/m/MultiComboBox";
import Popover from "sap/m/Popover";
import { ValueState } from "sap/ui/core/library";
import Input from "sap/m/Input";
import CategoryAxis from "sap/makit/CategoryAxis";
import Page from "sap/m/Page";

/**
 * @namespace com.infosys.mymonth.controller
 */
export default class Main extends Controller {
    private _tempSelectedDate: Date | null = null;
    private readonly DAYS_STORAGE_KEY = "selected_work_days";
    private readonly BUCKET_MAP_KEY = "wfh_buckets_map";
    private readonly DATA_STORAGE_KEY = "workTrackerData";
    private readonly OVERRIDES_KEY = "manual_date_overrides";

    private _sCurrentFilter: string | null = null;

    public formatter = {
        formatDate: function (oDate: any) {
            if (!oDate) return null;
            return oDate instanceof Date ? oDate : new Date(oDate);
        }
    };

    public onInit(): void {
        const oData = this._loadInitialData();
        const oModel = new JSONModel(oData);
        this.getView()?.setModel(oModel);
        this._initMultiComboSelection();
        this._vizSetup();
        this._refreshActiveMonthData();
    }





    private _loadInitialData(): any {
        const sSavedData = localStorage.getItem(this.DATA_STORAGE_KEY);
        const sSavedBuckets = localStorage.getItem(this.BUCKET_MAP_KEY);

        const now = new Date();

        // 1. Min Date: First day of the current month
        const minDate = new Date(now.getFullYear(), now.getMonth(), 1);

        // 2. Max Date: Last day of the month (current + 2 months)
        // April (0) -> June (2). We set month to now + 3 and date to 0 to get last day of month + 2
        const maxDate = new Date(now.getFullYear(), now.getMonth() + 3, 0);

        let oData;
        if (sSavedData) {
            oData = JSON.parse(sSavedData);
            oData.days = oData.days.map((day: any) => ({ ...day, date: new Date(day.date) }));
        } else {
            oData = this._generateDefaultMonthData();
        }

        oData.configDays = [
            { key: "1", text: "Monday" }, { key: "2", text: "Tuesday" },
            { key: "3", text: "Wednesday" }, { key: "4", text: "Thursday" },
            { key: "5", text: "Friday" }
        ];

        oData.availableMonths = this._generateMonthList();
        oData.selectedMonthKey = 0;
        oData.wfhBucketsMap = sSavedBuckets ? JSON.parse(sSavedBuckets) : {};
        oData.currentWfhBucket = "";
        // Ensure the calendar opens on the current month
        oData.calendarStartDate = new Date(now.getFullYear(), now.getMonth(), 1);

        // Add restriction dates to the model
        oData.minCalendarDate = minDate;
        oData.maxCalendarDate = maxDate;



        return oData;
    }

    private _generateMonthList(): any[] {
        const aMonths = [];
        const oDate = new Date();
        for (let i = 0; i < 3; i++) {
            const tempDate = new Date(oDate.getFullYear(), oDate.getMonth() + i, 1);
            const sLabel = tempDate.toLocaleString('default', { month: 'short' }) + " " + tempDate.getFullYear().toString().substr(-2);
            aMonths.push({ key: i.toString(), text: sLabel });
        }
        return aMonths;
    }

    private _generateDefaultMonthData(): any {
        const baseDate = new Date();
        const daysArray = [];
        const sSavedKeys = localStorage.getItem(this.DAYS_STORAGE_KEY);
        const aWorkDayKeys = sSavedKeys ? JSON.parse(sSavedKeys) : [];
        // Get Manual Overrides (Leave, Holiday, etc.)
        const sSavedOverrides = localStorage.getItem(this.OVERRIDES_KEY);
        const oOverrides = sSavedOverrides ? JSON.parse(sSavedOverrides) : {};
        for (let m = 0; m < 3; m++) {
            const year = baseDate.getFullYear();
            const month = baseDate.getMonth() + m;
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            for (let i = 1; i <= daysInMonth; i++) {
                const current = new Date(year, month, i);
                const sDateKey = current.toDateString();
                const dayOfWeek = current.getDay();
                let status, type;
                // PRIORITY 1: Check if user manually changed this specific day
                if (oOverrides[sDateKey]) {
                    status = oOverrides[sDateKey].status;
                    type = oOverrides[sDateKey].type;
                }
                // PRIORITY 2: Default logic for weekends and workdays
                else {
                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                        status = "Weekend"; type = "Type14";
                    } else if (aWorkDayKeys.includes(dayOfWeek.toString())) {
                        status = "WFO"; type = "Type02";
                    } else {
                        status = "WFH"; type = "Type08";
                    }
                }

                daysArray.push({ date: current, status: status, type: type });
            }
        }
        return { days: daysArray, chartData: [] };
    }




    private _refreshActiveMonthData(): void {
        const oModel = this.getView()?.getModel() as JSONModel;
        const oViewDate = oModel.getProperty("/calendarStartDate") as Date;
        const aMonths = oModel.getProperty("/availableMonths") as any[];

        // Find label for current view (e.g., "Apr 26")
        const currentMonthLabel = aMonths.find(m => {
            const d = new Date();
            d.setMonth(d.getMonth() + parseInt(m.key));
            return d.getMonth() === oViewDate.getMonth() && d.getFullYear() === oViewDate.getFullYear();
        })?.text;

        if (currentMonthLabel) {
            const oMap = oModel.getProperty("/wfhBucketsMap");
            oModel.setProperty("/currentWfhBucket", oMap[currentMonthLabel] || "");
        }
        this._updateChartData();
    }

    public onMonthChange(oEvent: any): void {
        const iMonthOffset = parseInt(oEvent.getParameter("selectedItem").getKey());
        const oNewDate = new Date();
        oNewDate.setMonth(oNewDate.getMonth() + iMonthOffset);
        oNewDate.setDate(1);

        const oModel = this.getView()?.getModel() as JSONModel;
        oModel.setProperty("/calendarStartDate", oNewDate);

        this._refreshActiveMonthData();
        // (this.getView()?.byId("settings") as Popover).close();

    }

    public onWfhBucketChange(oEvent: any): void {
        const sValue = oEvent.getParameter("value");
        const oModel = this.getView()?.getModel() as JSONModel;
        const oViewDate = oModel.getProperty("/calendarStartDate") as Date;
        const aMonths = oModel.getProperty("/availableMonths") as any[];

        const currentMonthLabel = aMonths.find(m => {
            const d = new Date();
            d.setMonth(d.getMonth() + parseInt(m.key));
            return d.getMonth() === oViewDate.getMonth();
        })?.text;

        if (currentMonthLabel) {
            const oMap = oModel.getProperty("/wfhBucketsMap");
            oMap[currentMonthLabel] = sValue;
            localStorage.setItem(this.BUCKET_MAP_KEY, JSON.stringify(oMap));
            this._updateChartData();

        }

    }

    private _updateChartData(): void {
        const oModel = this.getView()?.getModel() as JSONModel;
        const aDays = oModel.getProperty("/days") as any[];
        const oViewDate = oModel.getProperty("/calendarStartDate") as Date;

        if (!oViewDate || !aDays) return;

        const iMonth = oViewDate.getMonth();
        const iYear = oViewDate.getFullYear();

        // Get the current date and set time to 0 to compare dates only
        const oToday = new Date();
        oToday.setHours(0, 0, 0, 0);

        // 1. Filter for currently visible month AND only future dates (Remaining days)
        const remainingMonthDays = aDays.filter(d => {
            const dDate = (d.date instanceof Date) ? d.date : new Date(d.date);

            const isSameMonth = dDate.getMonth() === iMonth && dDate.getFullYear() === iYear;
            // Check if the date is today or in the future
            const isRemaining = dDate.getTime() >= oToday.getTime();

            return isSameMonth && isRemaining;
        });

        // 2. Use the 'remainingMonthDays' variable for your calculations
        const wfh = remainingMonthDays.filter(d => d.status === "WFH").length;
        const wfo = remainingMonthDays.filter(d => d.status === "WFO").length;
        const leaves = remainingMonthDays.filter(d => d.status === "Leave").length;
        const holiday = remainingMonthDays.filter(d => d.status === "Holiday").length;

        // 1. Get the full list of days for the currently visible month (ignoring 'today' constraint)
        const allMonthDays = aDays.filter(d => {
            const dDate = (d.date instanceof Date) ? d.date : new Date(d.date);

            // Only check if the date belongs to the selected month and year
            return dDate.getMonth() === iMonth && dDate.getFullYear() === iYear;
        });

        // 2. Calculate totals based on the entire month's data
        const wfhMonthTotal = allMonthDays.filter(d => d.status === "WFH").length;
        const wfoMonthTotal = allMonthDays.filter(d => d.status === "WFO").length;
        const leavesMonthTotal = allMonthDays.filter(d => d.status === "Leave").length;
        const holidayMonthTotal = allMonthDays.filter(d => d.status === "Holiday").length;

        // 3. Update the Summary Data in the Model
        // This will update the 'WFH Days' and 'WFO Days' tiles shown in your UI
        oModel.setProperty("/summary", {
            wfhTotal: wfhMonthTotal,
            wfoTotal: wfoMonthTotal,
            leaveTotal: leavesMonthTotal,
            workdays: wfhMonthTotal + wfoMonthTotal
        });

        // Update the VizFrame Data
        oModel.setProperty("/chartData", [
            { category: "Workdays", value: wfh + wfo },
            { category: "WFH", value: wfh },
            { category: "WFO", value: wfo },
            { category: "Leave", value: leaves }
        ]);

        this._validateWfhBucket(wfhMonthTotal - (leavesMonthTotal + holidayMonthTotal));
    }
    private _validateWfhBucket(iCurrentWfh: number): void {
        const oModel = this.getView()?.getModel() as JSONModel;
        const sBucket = oModel.getProperty("/currentWfhBucket");
        const oInput = this.getView()?.byId("wfhBucketInput") as Input;

        if (sBucket && parseInt(sBucket) < iCurrentWfh) {
            oInput.setValueState(ValueState.Error);
            oInput.setValueStateText(`Planned WFH:${iCurrentWfh} exceeding the WFH Bucket:${sBucket}`);
            MessageToast.show(`Planned WFH:${iCurrentWfh} exceeding the WFH Bucket:${sBucket}`);
        } else if (sBucket && parseInt(sBucket) > iCurrentWfh) {
            oInput.setValueState(ValueState.Warning);
            oInput.setValueStateText(`Planned WFH:${iCurrentWfh} Not reached limit of WFH Bucket:${sBucket}`);
            MessageToast.show(`Planned WFH:${iCurrentWfh} Not reached limit of WFH Bucket:${sBucket}`);
        }
        else {
            oInput.setValueState(ValueState.None);
        }
    }

    public onStatusChange(oEvent: any): void {
        const sStatus = oEvent.getParameter("listItem").getTitle();
        const oModel = this.getView()?.getModel() as JSONModel;
        const aDays = oModel.getProperty("/days") as any[];

        if (this._tempSelectedDate) {
            const sDateKey = this._tempSelectedDate.toDateString();

            // Save to Overrides Map in LocalStorage
            const sSavedOverrides = localStorage.getItem(this.OVERRIDES_KEY);
            const oOverrides = sSavedOverrides ? JSON.parse(sSavedOverrides) : {};
            oOverrides[sDateKey] = { status: sStatus, type: this._getColorByType(sStatus) };
            localStorage.setItem(this.OVERRIDES_KEY, JSON.stringify(oOverrides));

            // Update the current model array
            const oDay = aDays.find(d => d.date.toDateString() === sDateKey);
            if (oDay) {
                oDay.status = sStatus;
                oDay.type = this._getColorByType(sStatus);
                oModel.refresh();

                // Sync the full state
                localStorage.setItem(this.DATA_STORAGE_KEY, JSON.stringify(oModel.getData()));
                this._updateChartData();
            }
        }
        (this.getView()?.byId("statusPopover") as Popover).close();
    }

    public onSelectionChange(oEvent: any): void {
        const aSelectedKeys = oEvent.getSource().getSelectedKeys() as string[];
        localStorage.setItem(this.DAYS_STORAGE_KEY, JSON.stringify(aSelectedKeys));

        const oNewData = this._generateDefaultMonthData();
        const oModel = this.getView()?.getModel() as JSONModel;
        oModel.setProperty("/days", oNewData.days);
        localStorage.setItem(this.DATA_STORAGE_KEY, JSON.stringify(oModel.getData()));
        this._updateChartData();
        // (this.getView()?.byId("settings") as Popover).close();
    }

    public onReset(): void {
        MessageBox.confirm("Reset all manual changes (Leaves/Holidays) as well?", {
            actions: ["Reset All", "Reset WFO/WFH Only", MessageBox.Action.CANCEL],
            onClose: (oAction: any) => {
                if (oAction === "Reset All") {
                    localStorage.removeItem(this.OVERRIDES_KEY);
                }

                // Re-run the generator (it will now respect whatever is left in Overrides)
                const oNewData = this._generateDefaultMonthData();
                const oModel = this.getView()?.getModel() as JSONModel;
                oModel.setProperty("/days", oNewData.days);

                localStorage.setItem(this.DATA_STORAGE_KEY, JSON.stringify(oModel.getData()));
                this._refreshActiveMonthData();
            }
        });
    }


    private _vizSetup(): void {
        const oVizFrame = this.getView()?.byId("idVizFrame") as VizFrame;
        oVizFrame?.setVizProperties({
            plotArea: {
                dataLabel: { visible: true },
                dataPointStyle: {
                    "rules": [
                        { "displayName": "Workdays", "dataContext": { "Category": "Workdays" }, "properties": { "color": "#fafaf5" } },
                        { "displayName": "WFH", "dataContext": { "Category": "WFH" }, "properties": { "color": "#73f073" } },
                        { "displayName": "WFO", "dataContext": { "Category": "WFO" }, "properties": { "color": "#d98d41" } },
                        { "displayName": "Leave", "dataContext": { "Category": "Leave" }, "properties": { "color": "#5995f0" } }

                    ]
                }
            },
            title: { visible: true, text: "Remaining Days Forecast" },
            valueAxis: { title: { visible: true, text: "Days" } },
            CategoryAxis: {
                title: { visible: true, text: "category" },
                label: {
                    visible: true
                }
            },
            legend: {
                visible: false,
                isScrollable: false,
                alignment: "center",
                type: "common"
            },
            legendGroup: {
                layout: {
                    position: "bottom"
                }
            }
        });
    }

    private _initMultiComboSelection(): void {
        const oMultiCombo = this.getView()?.byId("daysSelector") as MultiComboBox;
        const sSavedDays = localStorage.getItem(this.DAYS_STORAGE_KEY);
        oMultiCombo?.setSelectedKeys(sSavedDays ? JSON.parse(sSavedDays) : []);
    }

    public handleDaySelect(oEvent: Event): void {
        const oCalendar = oEvent.getSource() as Calendar;
        const aSelectedDates = oCalendar.getSelectedDates();
        if (aSelectedDates.length > 0) {
            this._tempSelectedDate = aSelectedDates[0].getStartDate() as unknown as Date;
            (this.getView()?.byId("statusPopover") as Popover).openBy(oCalendar);

        }
    }

    public OnSettings(oEvent: Event): void {
        const oButton = oEvent.getSource() as any;
        (this.getView()?.byId("settings") as Popover).openBy(oButton);


    }

    public handleMonthChange(oEvent: any): void {
        const oModel = this.getView()?.getModel() as JSONModel;

        // Get the new start date from the calendar navigation event
        const oNewStartDate = oEvent.getSource().getStartDate();

        // Update the model so the filter knows which month we are looking at
        oModel.setProperty("/calendarStartDate", oNewStartDate);

        // Refresh the chart and allocation based on the new month
        this._updateChartData();
        this._updateAllocationDropdown(oNewStartDate);
    }

    private _updateAllocationDropdown(oDate: Date): void {
        const oModel = this.getView()?.getModel() as JSONModel;

        // Logic to update your WFH Allocation dropdown value
        // For example, if you want to reset it or fetch new limits for May
        const iMonth = oDate.getMonth();
        const currentMonth = new Date().getMonth();
        let selectedMonthKey = 0;
        if (currentMonth < iMonth) {
            selectedMonthKey = iMonth - currentMonth;
        } else if (currentMonth < iMonth) {
            selectedMonthKey = currentMonth - iMonth;
        }
        if (selectedMonthKey < 3) {

            oModel.setProperty("/selectedMonthKey", selectedMonthKey);

        } else {
            oModel.setProperty("/selectedMonthKey", 0);

        }

        const oNewDate = new Date();
        oNewDate.setMonth(oNewDate.getMonth() + selectedMonthKey);
        oNewDate.setDate(1);


        oModel.setProperty("/calendarStartDate", oNewDate);
        this._refreshActiveMonthData();

    }


    private _getColorByType(s: string): string {
        const m: any = { "WFH": "Type08", "WFO": "Type02", "Leave": "Type06", "Holiday": "Type04" };
        return m[s] || "None";
    }


    public onWFHPress(): void {
        this._toggleCalendarFilter("WFH", "Type08"); // WFH Color
    }

    public onWFOPress(): void {
        this._toggleCalendarFilter("WFO", "Type02"); // WFO Color
    }

    private _toggleCalendarFilter(sStatus: string, sActiveType: string): void {
        const oModel = this.getView()?.getModel() as JSONModel;
        const aDays = oModel.getProperty("/days") as any[];

        // If clicking the same tile again, reset to default
        if (this._sCurrentFilter === sStatus) {
            this._resetCalendar();
            this._sCurrentFilter = null;
            return;
        }

        this._sCurrentFilter = sStatus;

        // Map through days to update the visual 'type'
        const aUpdatedDays = aDays.map((oDay: any) => {
            return {
                ...oDay,
                // If status matches, show color; otherwise, set to "None" (transparent)
                type: oDay.status === sStatus ? sActiveType : "None"
            };
        });

        oModel.setProperty("/days", aUpdatedDays);
    }

    public _resetCalendar(): void {
        const oModel = this.getView()?.getModel() as JSONModel;

        // Call your existing generation logic to restore original Type08/Type02/Type14 colors
        const oDefaultData = this._generateDefaultMonthData();
        oModel.setProperty("/days", oDefaultData.days);

        this._sCurrentFilter = null;
    }

}
