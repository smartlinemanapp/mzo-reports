/* lib/nsc_rows.js — one parser for the NSC dump (CACHE_NSC_v5), shared by the NSC draft pages.
 * NSCRows.parse(textOrRows) → rows (one per APPL_NO, last row wins), already filtered to the login scope.
 *
 * Stages of a pending (paid, not yet connected) application:
 *   nowo  — waiting for the work order (WO_ISSUED = N)
 *   pole  — work order issued, pole work needed
 *   ready — work order issued, no poles needed
 *   meter — meter number allotted, connection still pending
 */
(function (w) {
  'use strict';
  var CLASS = { D: 'Domestic', A: 'Agriculture', C: 'Commercial', P: 'Public', I: 'Industrial', W: 'Water works', S: 'Street light' };
  var STAGES = [
    { key: 'nowo', label: 'Waiting for work order', short: 'No work order' },
    { key: 'pole', label: 'Pole work', short: 'Pole work' },
    { key: 'ready', label: 'Ready to connect', short: 'Ready' },
    { key: 'meter', label: 'Meter allotted', short: 'Meter allotted' }
  ];
  function blank(v) { var s = String(v == null ? '' : v).trim(); return !s || /^\(?null\)?$/i.test(s); }
  function title(s) { return w.UI ? w.UI.title(s) : String(s || ''); }
  function days(a, b) { return a && b ? Math.max(0, Math.round((b - a) / 864e5)) : null; }

  function parse(input) {
    var list = w.UI.csv(input), byAppl = new Map(), today = null;
    for (var i = 0; i < list.length; i++) {
      var d = list[i] || {};
      var appl = String(d.APPL_NO || '').trim();
      if (!appl) continue;
      byAppl.set(appl, d);
      if (!today && d.TODAY) today = w.UI.date(d.TODAY);
    }
    var S = w.MzoScope, rows = [];
    byAppl.forEach(function (d, appl) {
      var o = w.UI.office(d.CCC_CODE, d.SUPP_OFF);
      var poles = parseInt(d.NO_OF_POLES, 10) || 0;
      var wo = String(d.WO_ISSUED || '').trim().toUpperCase() === 'Y';
      var meter = blank(d.METER_NUMBER) ? '' : String(d.METER_NUMBER).trim();
      var pole = poles > 0 || /^pole/i.test(String(d.PoleNonPole || ''));
      var paid = w.UI.date(d.COLL_DATE), woDate = w.UI.date(d.WO_CREATION_DATE);
      var delay = parseFloat(d.DelayInSC);
      var cls = String(d.CONN_CLASS || '').trim().toUpperCase();
      var wh = String(d.SCN_WITHELD_DATE || '').trim();
      var r = {
        appl: appl, con: String(d.CON_ID || '').trim(),
        name: blank(d.NAME) ? '' : title(d.NAME), phone: blank(d.PHONE_NO) ? '' : String(d.PHONE_NO).trim(), address: blank(d.ADDRESS) ? '' : d.ADDRESS,
        _region: o.region || (S && S.regionNameOf(d.REGION || d.REG)) || '', _divn: o.division || (S && S.divisionNameOf(d.DIVN_NAME)) || String(d.DIVN_NAME || ''),
        _supp: o.ccc || (S && S.cccNameOf(d.SUPP_OFF)) || String(d.SUPP_OFF || ''), CCC_CODE: String(d.CCC_CODE || '').trim(),
        cls: cls, clsLabel: CLASS[cls] || cls || '—', phase: String(d.APPLIED_PHASE || '').trim().toUpperCase(), load: parseFloat(d.LOAD_WATTS) || 0,
        area: d.CONN_CAT === 'U' ? 'Urban' : d.CONN_CAT === 'R' ? 'Rural' : '',
        poles: poles, pole: pole, wo: wo, won: blank(d.WON) ? '' : String(d.WON).trim(), agency: blank(d.AGENCY_NAME) ? '' : String(d.AGENCY_NAME).trim(),
        meter: meter, withheld: wh !== '' && wh !== '0', reason: blank(d.SCN_WITHELD_REASON) ? '' : d.SCN_WITHELD_REASON,
        paid: paid, woDate: woDate, delay: isNaN(delay) ? days(paid, today) : delay, woDays: wo ? days(woDate, today) : null,
        portal: String(d.IS_PORTAL_APPL || '').toUpperCase() === 'Y', comment: blank(d.INSPECTION_COMMENT) ? '' : d.INSPECTION_COMMENT,
        delayRange: String(d.DelayRange || '').trim(), delaySerial: parseInt(d.DelaySerial, 10) || 0,
        procB: String(d.APPLICANT_TYPE || '').trim() === 'Promoter/ Developer'
      };
      r.stage = meter ? 'meter' : !wo ? 'nowo' : pole ? 'pole' : 'ready';
      rows.push(r);
    });
    if (S) rows = S.filterRows(rows);
    rows.asOn = today;
    return rows;
  }

  w.NSCRows = { parse: parse, STAGES: STAGES, CLASS: CLASS };
})(window);
