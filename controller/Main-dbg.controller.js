sap.ui.define(["sap/ui/core/mvc/Controller", "sap/ui/model/json/JSONModel", "sap/m/MessageBox", "sap/m/MessageToast", "sap/ui/core/library"], function (Controller, JSONModel, MessageBox, MessageToast, sap_ui_core_library) {
  "use strict";

  const ValueState = sap_ui_core_library["ValueState"];
  /**
   * @namespace com.infosys.mymonth.controller
   */
  const Main = Controller.extend("com.infosys.mymonth.controller.Main", {
    constructor: function constructor() {
      Controller.prototype.constructor.apply(this, arguments);
      this._tempSelectedDate = null;
      this.DAYS_STORAGE_KEY = "selected_work_days";
      this.BUCKET_MAP_KEY = "wfh_buckets_map";
      this.DATA_STORAGE_KEY = "workTrackerData";
      this.OVERRIDES_KEY = "manual_date_overrides";
      this._sCurrentFilter = null;
      this.formatter = {
        formatDate: function (oDate) {
          if (!oDate) return null;
          return oDate instanceof Date ? oDate : new Date(oDate);
        }
      };
    },
    onInit: function _onInit() {
      const oData = this._loadInitialData();
      const oModel = new JSONModel(oData);
      this.getView()?.setModel(oModel);
      this._initMultiComboSelection();
      this._vizSetup();
      this._refreshActiveMonthData();
    },
    _loadInitialData: function _loadInitialData() {
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
        oData.days = oData.days.map(day => ({
          ...day,
          date: new Date(day.date)
        }));
      } else {
        oData = this._generateDefaultMonthData();
      }
      oData.configDays = [{
        key: "1",
        text: "Monday"
      }, {
        key: "2",
        text: "Tuesday"
      }, {
        key: "3",
        text: "Wednesday"
      }, {
        key: "4",
        text: "Thursday"
      }, {
        key: "5",
        text: "Friday"
      }];
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
    },
    _generateMonthList: function _generateMonthList() {
      const aMonths = [];
      const oDate = new Date();
      for (let i = 0; i < 3; i++) {
        const tempDate = new Date(oDate.getFullYear(), oDate.getMonth() + i, 1);
        const sLabel = tempDate.toLocaleString('default', {
          month: 'short'
        }) + " " + tempDate.getFullYear().toString().substr(-2);
        aMonths.push({
          key: i.toString(),
          text: sLabel
        });
      }
      return aMonths;
    },
    _generateDefaultMonthData: function _generateDefaultMonthData() {
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
              status = "Weekend";
              type = "Type14";
            } else if (aWorkDayKeys.includes(dayOfWeek.toString())) {
              status = "WFO";
              type = "Type02";
            } else {
              status = "WFH";
              type = "Type08";
            }
          }
          daysArray.push({
            date: current,
            status: status,
            type: type
          });
        }
      }
      return {
        days: daysArray,
        chartData: []
      };
    },
    _refreshActiveMonthData: function _refreshActiveMonthData() {
      const oModel = this.getView()?.getModel();
      const oViewDate = oModel.getProperty("/calendarStartDate");
      const aMonths = oModel.getProperty("/availableMonths");

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
    },
    onMonthChange: function _onMonthChange(oEvent) {
      const iMonthOffset = parseInt(oEvent.getParameter("selectedItem").getKey());
      const oNewDate = new Date();
      oNewDate.setMonth(oNewDate.getMonth() + iMonthOffset);
      oNewDate.setDate(1);
      const oModel = this.getView()?.getModel();
      oModel.setProperty("/calendarStartDate", oNewDate);
      this._refreshActiveMonthData();
      (this.getView()?.byId("settings")).close();
    },
    onWfhBucketChange: function _onWfhBucketChange(oEvent) {
      const sValue = oEvent.getParameter("value");
      const oModel = this.getView()?.getModel();
      const oViewDate = oModel.getProperty("/calendarStartDate");
      const aMonths = oModel.getProperty("/availableMonths");
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
      (this.getView()?.byId("settings")).close();
    },
    _updateChartData: function _updateChartData() {
      const oModel = this.getView()?.getModel();
      const aDays = oModel.getProperty("/days");
      const oViewDate = oModel.getProperty("/calendarStartDate");
      if (!oViewDate || !aDays) return;
      const iMonth = oViewDate.getMonth();
      const iYear = oViewDate.getFullYear();

      // Get the current date and set time to 0 to compare dates only
      const oToday = new Date();
      oToday.setHours(0, 0, 0, 0);

      // 1. Filter for currently visible month AND only future dates (Remaining days)
      const remainingMonthDays = aDays.filter(d => {
        const dDate = d.date instanceof Date ? d.date : new Date(d.date);
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
        const dDate = d.date instanceof Date ? d.date : new Date(d.date);

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
      oModel.setProperty("/chartData", [{
        category: "Workdays",
        value: wfh + wfo
      }, {
        category: "WFH",
        value: wfh
      }, {
        category: "WFO",
        value: wfo
      }, {
        category: "Leave",
        value: leaves
      }]);
      this._validateWfhBucket(wfhMonthTotal - (leavesMonthTotal + holidayMonthTotal));
    },
    _validateWfhBucket: function _validateWfhBucket(iCurrentWfh) {
      const oModel = this.getView()?.getModel();
      const sBucket = oModel.getProperty("/currentWfhBucket");
      const oInput = this.getView()?.byId("wfhBucketInput");
      if (sBucket && parseInt(sBucket) < iCurrentWfh) {
        oInput.setValueState(ValueState.Error);
        oInput.setValueStateText(`Planned WFH:${iCurrentWfh} exceeding the WFH Bucket:${sBucket}`);
        MessageToast.show(`Planned WFH:${iCurrentWfh} exceeding the WFH Bucket:${sBucket}`);
      } else if (sBucket && parseInt(sBucket) > iCurrentWfh) {
        oInput.setValueState(ValueState.Warning);
        oInput.setValueStateText(`Planned WFH:${iCurrentWfh} Not reached limit of WFH Bucket:${sBucket}`);
        MessageToast.show(`Planned WFH:${iCurrentWfh} Not reached limit of WFH Bucket:${sBucket}`);
      } else {
        oInput.setValueState(ValueState.None);
      }
    },
    onStatusChange: function _onStatusChange(oEvent) {
      const sStatus = oEvent.getParameter("listItem").getTitle();
      const oModel = this.getView()?.getModel();
      const aDays = oModel.getProperty("/days");
      if (this._tempSelectedDate) {
        const sDateKey = this._tempSelectedDate.toDateString();

        // Save to Overrides Map in LocalStorage
        const sSavedOverrides = localStorage.getItem(this.OVERRIDES_KEY);
        const oOverrides = sSavedOverrides ? JSON.parse(sSavedOverrides) : {};
        oOverrides[sDateKey] = {
          status: sStatus,
          type: this._getColorByType(sStatus)
        };
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
      (this.getView()?.byId("statusPopover")).close();
    },
    onSelectionChange: function _onSelectionChange(oEvent) {
      const aSelectedKeys = oEvent.getSource().getSelectedKeys();
      localStorage.setItem(this.DAYS_STORAGE_KEY, JSON.stringify(aSelectedKeys));
      const oNewData = this._generateDefaultMonthData();
      const oModel = this.getView()?.getModel();
      oModel.setProperty("/days", oNewData.days);
      localStorage.setItem(this.DATA_STORAGE_KEY, JSON.stringify(oModel.getData()));
      this._updateChartData();
      (this.getView()?.byId("settings")).close();
    },
    onReset: function _onReset() {
      MessageBox.confirm("Reset all manual changes (Leaves/Holidays) as well?", {
        actions: ["Reset All", "Reset WFO/WFH Only", MessageBox.Action.CANCEL],
        onClose: oAction => {
          if (oAction === "Reset All") {
            localStorage.removeItem(this.OVERRIDES_KEY);
          }

          // Re-run the generator (it will now respect whatever is left in Overrides)
          const oNewData = this._generateDefaultMonthData();
          const oModel = this.getView()?.getModel();
          oModel.setProperty("/days", oNewData.days);
          localStorage.setItem(this.DATA_STORAGE_KEY, JSON.stringify(oModel.getData()));
          this._refreshActiveMonthData();
        }
      });
    },
    _vizSetup: function _vizSetup() {
      const oVizFrame = this.getView()?.byId("idVizFrame");
      oVizFrame?.setVizProperties({
        plotArea: {
          dataLabel: {
            visible: true
          },
          dataPointStyle: {
            "rules": [{
              "displayName": "Workdays",
              "dataContext": {
                "Category": "Workdays"
              },
              "properties": {
                "color": "#fafaf5"
              }
            }, {
              "displayName": "WFH",
              "dataContext": {
                "Category": "WFH"
              },
              "properties": {
                "color": "#73f073"
              }
            }, {
              "displayName": "WFO",
              "dataContext": {
                "Category": "WFO"
              },
              "properties": {
                "color": "#d98d41"
              }
            }, {
              "displayName": "Leave",
              "dataContext": {
                "Category": "Leave"
              },
              "properties": {
                "color": "#5995f0"
              }
            }]
          }
        },
        title: {
          visible: true,
          text: "Remaining Days Forecast"
        },
        valueAxis: {
          title: {
            visible: true,
            text: "Days"
          }
        },
        CategoryAxis: {
          title: {
            visible: true,
            text: "category"
          },
          label: {
            visible: true
          }
        },
        legend: {
          visible: true,
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
    },
    _initMultiComboSelection: function _initMultiComboSelection() {
      const oMultiCombo = this.getView()?.byId("daysSelector");
      const sSavedDays = localStorage.getItem(this.DAYS_STORAGE_KEY);
      oMultiCombo?.setSelectedKeys(sSavedDays ? JSON.parse(sSavedDays) : []);
    },
    handleDaySelect: function _handleDaySelect(oEvent) {
      const oCalendar = oEvent.getSource();
      const aSelectedDates = oCalendar.getSelectedDates();
      if (aSelectedDates.length > 0) {
        this._tempSelectedDate = aSelectedDates[0].getStartDate();
        (this.getView()?.byId("statusPopover")).openBy(oCalendar);
      }
    },
    OnSettings: function _OnSettings(oEvent) {
      const oButton = oEvent.getSource();
      (this.getView()?.byId("settings")).openBy(oButton);
    },
    handleMonthChange: function _handleMonthChange(oEvent) {
      const oModel = this.getView()?.getModel();

      // Get the new start date from the calendar navigation event
      const oNewStartDate = oEvent.getSource().getStartDate();

      // Update the model so the filter knows which month we are looking at
      oModel.setProperty("/calendarStartDate", oNewStartDate);

      // Refresh the chart and allocation based on the new month
      this._updateChartData();
      this._updateAllocationDropdown(oNewStartDate);
    },
    _updateAllocationDropdown: function _updateAllocationDropdown(oDate) {
      const oModel = this.getView()?.getModel();

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
    },
    _getColorByType: function _getColorByType(s) {
      const m = {
        "WFH": "Type08",
        "WFO": "Type02",
        "Leave": "Type06",
        "Holiday": "Type04"
      };
      return m[s] || "None";
    },
    onWFHPress: function _onWFHPress() {
      this._toggleCalendarFilter("WFH", "Type08"); // WFH Color
    },
    onWFOPress: function _onWFOPress() {
      this._toggleCalendarFilter("WFO", "Type02"); // WFO Color
    },
    _toggleCalendarFilter: function _toggleCalendarFilter(sStatus, sActiveType) {
      const oModel = this.getView()?.getModel();
      const aDays = oModel.getProperty("/days");

      // If clicking the same tile again, reset to default
      if (this._sCurrentFilter === sStatus) {
        this._resetCalendar();
        this._sCurrentFilter = null;
        return;
      }
      this._sCurrentFilter = sStatus;

      // Map through days to update the visual 'type'
      const aUpdatedDays = aDays.map(oDay => {
        return {
          ...oDay,
          // If status matches, show color; otherwise, set to "None" (transparent)
          type: oDay.status === sStatus ? sActiveType : "None"
        };
      });
      oModel.setProperty("/days", aUpdatedDays);
    },
    _resetCalendar: function _resetCalendar() {
      const oModel = this.getView()?.getModel();

      // Call your existing generation logic to restore original Type08/Type02/Type14 colors
      const oDefaultData = this._generateDefaultMonthData();
      oModel.setProperty("/days", oDefaultData.days);
      this._sCurrentFilter = null;
    }
  });
  return Main;
});
//# sourceMappingURL=Main-dbg.controller.js.map
