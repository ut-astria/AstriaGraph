/*
 * main.js - AstriaGraph visualization entry point.
 * Copyright (C) 2018-2019 University of Texas
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var DataSources = []
var NumFields = [0, 4, 5, 6, 7, 22, 23, 24, 25, 26, 27]
var InfoFields = ["Name", "Country", "CatalogId", "NoradId", "BirthDate", "Operator", "Users",
		  "Purpose", "DetailedPurpose", "LaunchMass", "DryMass", "Power", "Lifetime",
		  "Contractor", "LaunchSite", "LaunchVehicle"]

var ObjData = {}
var DebrisLoaded = false

var CsOrbitEnt = []

var HomeLat = 30.3
var HomeLon = -97.7

var SimInt = 90*60
var SimStart = Cesium.JulianDate.now()
var SimStop = Cesium.JulianDate.addSeconds(SimStart, SimInt, new Cesium.JulianDate())

function GetDataSources()
{
    $.ajax({method : "GET", url : "/AstriaGraph/api/www_data_sources",
    success : function(resp)
    {
	var i, fields
	var recs = resp.split(/\r\n|\n/)
	var hdrs = recs[0].split(/\t/)

	$("#DataSrcSelect").append($("<option>", {value : "ALL", text : "All"}))
	for (i = 1; i < recs.length; i++)
	{
	    fields = recs[i].split(/\t/)
	    if (fields.length < hdrs.length)
		continue

	    DataSources[fields[0]] = fields[1]
	    if (fields[1] != "UCS")
		$("#DataSrcSelect").append($("<option>", {value : fields[1], text : fields[1]}))
	}

	$("#DataSrcSelect").val("ALL")
	$("#DataSrcSelect").selectmenu("refresh")
	GetSpaceObjects("/AstriaGraph/api/www_query?filter=", "NODEB", DisplayObjects)
    }})
}

function GetSpaceObjects(url, filt, OnDone)
{
    $.ajax({method : "GET", url : url + filt,
    success : function(resp)
    {
	var fields, val, col, i, j
	var recs = resp.split(/\r\n|\n/)
	var hdrs = recs[0].split(/\t/)

	var N = 0
	for (i in ObjData)
	    N++

	for (i = 1; i < recs.length; i++)
	{
	    fields = recs[i].split(/\t/)
	    if (fields.length < hdrs.length)
		continue

	    ObjData[N+i-1] = {}
	    ObjData[N+i-1]["Elem"] = {}
	    for (j = 0; j < fields.length; j++)
	    {
		col = hdrs[j]
		if (fields[j].length > 0)
		{
		    if (NumFields.indexOf(j) != -1)
		    {
			val = Number(fields[j])
			if (isNaN(val))
			    val = fields[j]
		    }
		    else
			val = fields[j]
		}
		else
		    val = ""

		if (j == 0)
		{
		    ObjData[N+i-1]["DataSource"] = DataSources[val]
		    continue
		}

		if (col == "Epoch" || col == "SMA" || col == "Ecc" || col == "Inc" ||
		    col == "RAAN" || col == "ArgP" || col == "MeanAnom")
		    ObjData[N+i-1]["Elem"][col] = val
		else
		    ObjData[N+i-1][col] = val
	    }
	}

	OnDone(ObjData)
    }})
}

function DisplayObjects(D)
{
    var epjd = new Cesium.JulianDate()
    var dsnsel = $("#DataSrcSelect").val()
    var orgsel = $("#OriginSelect").val()
    var regsel = $("#RegimeSelect").val()
    var ent, trk, t, X, col, htm, ele, fld, i, name, names = []
    var CRFtoTRF = Cesium.Transforms.computeIcrfToFixedMatrix(SimStart)
    var debcb = window.document.getElementById("DebrisToggle")

    CsView.entities.suspendEvents()

    for (var i = 0; i < CsOrbitEnt.length; i++)
    {
	CsOrbitEnt[i].polyline.width = 0
	CsOrbitEnt[i].label.text = ""
    }
    CsOrbitEnt = []

    var active = []
    for (var s in D)
    {
	trk = D[s]
	if (trk["DataSource"] == "UCS")
	    active.push(trk["NoradId"])
	if (trk["DataSource"] == "USSTRATCOM" &&
	    (trk["BirthDate"].length > 4 && Number(trk["BirthDate"].slice(0, 4)) >= 2017) &&
	    trk["Name"].search("DEB") == -1 && trk["Name"].search("R/B") == -1)
	    active.push(trk["NoradId"])
    }

    for (s in D)
    {
	trk = D[s]
	if (trk["DataSource"] == "UCS")
	    continue

	ent = CsView.entities.getById(s)
	if ((dsnsel == "ALL" || dsnsel == trk["DataSource"]) &&
	    (orgsel == "ALL" || orgsel == trk["Country"]) &&
	    (regsel == "ALL" || regsel == trk["OrbitType"]))
	{
	    if (trk["Name"].length > 0)
	    {
		if (trk["NoradId"].length > 0)
		    name = trk["Name"] + " (" + trk["NoradId"] + ")"
		else
		    name = trk["Name"] + " (" + trk["CatalogId"] + ")"
		for (i = 0; i < names.length; i++)
		{
		    if (names[i].label == name)
			break
		}
		if (i == names.length)
		    names.push({label : name, value : s})
	    }

	    if (!(typeof ent === "undefined"))
	    {
		ent.show = (trk["Name"].search("R/B") == -1 &&
		trk["Name"].search("DEB") == -1) || debcb.checked
		ent.description = ""
		continue
	    }
	}
	else
	{
	    if (!(typeof ent === "undefined"))
	    {
		ent.show = false
		ent.description = ""
		continue
	    }
	}

	Cesium.JulianDate.fromIso8601(trk["Elem"]["Epoch"], epjd)
	t = Cesium.JulianDate.daysDifference(SimStart, epjd)
	trk["Elem"]["mmo"] = Math.sqrt(EGM96_mu/(trk["Elem"]["SMA"]*trk["Elem"]["SMA"]*trk["Elem"]["SMA"]))
	trk["Elem"]["MeanAnom"] = (trk["Elem"]["MeanAnom"] + trk["Elem"]["mmo"]*t*86400) % TwoPi

	if (active.indexOf(trk["NoradId"]) == -1)
	    col = Cesium.Color.CYAN
	else
	    col = Cesium.Color.DARKORANGE

	if (trk["Name"].search("R/B") != -1)
	    col = Cesium.Color.MEDIUMORCHID
	if (trk["Name"].search("DEB") != -1)
	    col = Cesium.Color.GRAY
	if ((trk["DataSource"] == "JSC Vimpel" && trk["NoradId"] == "") || trk["DataSource"] == "SeeSat-L")
	    col = Cesium.Color.DEEPPINK

	CsView.entities.add({id : s,
			     name : trk["Name"],
			     availability : new Cesium.TimeIntervalCollection(
				 [new Cesium.TimeInterval({start : SimStart, stop : SimStop})]),
			     position : new Cesium.CallbackProperty(UpdatePosition(CRFtoTRF, s), false),
			     point : {
				 pixelSize : 7,
				 color : col
			     }})
    }

    CsView.entities.resumeEvents()
    $("#SearchBox").autocomplete({source : names, minLength : 3})
    window.document.getElementById("Loader").style.display = "none"
}

function UpdatePosition(CRFtoTRF, trkid)
{
    return(function UpdateHelper() {
	var ele = ObjData[trkid]["Elem"]
	var t = Cesium.JulianDate.secondsDifference(CsView.clock.currentTime, SimStart)
	var u = jQuery.extend({}, ele)
	u.MeanAnom = (u.MeanAnom + u.mmo*t) % TwoPi
	var eff = new Cesium.Cartesian3()
	var eci = eltocart(u, true, 1E-3)
	Cesium.Matrix3.multiplyByVector(CRFtoTRF, eci, eff)
	return(eff)
    })
}

function DisplayOrbit(obj)
{
    var dsnsel = $("#DataSrcSelect").val()
    var car = new Cesium.Cartographic()
    var Y = new Cesium.Cartesian3()
    var CRFtoTRF = Cesium.Transforms.computeIcrfToFixedMatrix(SimStart)

    obj.description = ""
    for (var i = 0; i < CsOrbitEnt.length; i++)
    {
	CsOrbitEnt[i].polyline.width = 0
	CsOrbitEnt[i].label.text = ""
    }
    CsOrbitEnt = []

    i = 1
    for (var s in ObjData)
    {
	var same = ObjData[s]
	if (dsnsel != "ALL" && dsnsel != same["DataSource"])
	    continue
	if (s != obj.id && (same["NoradId"].length == 0 || same["NoradId"] != ObjData[obj.id]["NoradId"]))
	    continue

	var sta, arr = []
	var ele = same["Elem"]
	var u = jQuery.extend({}, ele)
	for (u.MeanAnom = 0; u.MeanAnom <= 6.29; u.MeanAnom += 0.01)
	{
	    if (u.MeanAnom == 0)
	    {
		sta = eltocart(u, false, 1E-6, 100)
		Cesium.Matrix3.multiplyByVector(CRFtoTRF, sta.pos, Y)

		var htm = `<table border : 1px solid white style = "width:100%">
		    <tr><th align = "center" style = "color:yellow">
		    <strong>Data Source</strong></th>
		    <th align = "center" style = "color:yellow">
		    <strong>(${i}) ${same["DataSource"]}</strong></th></tr>`

		if (same["DataSource"].search("Astria OD") != -1)
		{
		    var idx1 = same["DataSource"].indexOf("/") + 1
		    var idx2 = same["DataSource"].lastIndexOf(" ")
		    var statlink = "OD_stats/" + same["DataSource"].slice(idx1, idx2) +
			"_" + same["NoradId"] + ".html"
		    htm = htm +	`<tr><td colspan = "2" align = "center">
			Click <a href = ${statlink} target = "_blank" style = "color:blue">here</a>
			for orbit determination statistics</td></tr>`
		}

		InfoFields.forEach (function(inf) {
		    if (same[inf].length > 0)
			htm = htm + `<tr><td>${inf}</td> <td align = "right">${same[inf]}</td></tr>`
		})

		if (same["DataSource"] != "UCS")
		{
			htm = htm + `<tr><td>Data epoch</td>
		    	<td align = "right">${same["Elem"]["Epoch"].substring(0, 24)}</td></tr>
		    	<tr><td>Semi-major axis</td>
		    	<td align = "right">${(ele.SMA/1000).toFixed(1)} km</td></tr>
		    	<tr><td>Eccentricity</td>
		    	<td align = "right">${ele.Ecc.toFixed(4)}</td></tr>
		    	<tr><td>Inclination</td>
		    	<td align = "right">${(ele.Inc*180/Math.PI).toFixed(4)}&deg;</td></tr>
		    	<tr><td>RA of ascending node</td>
		    	<td align = "right">${(ele.RAAN*180/Math.PI).toFixed(4)}&deg;</td></tr>
		    	<tr><td>Argument of perigee</td>
		    	<td align = "right">${(ele.ArgP*180/Math.PI).toFixed(4)}&deg;</td></tr>
		    	<tr><td>Mean motion</td>
		    	<td align = "right">${(ele.mmo*180/Math.PI).toFixed(4)}
		    	<sup>&deg;</sup>&frasl;<sub>s</sub></td></tr>
		    	<tr><td>Orbital speed</td>
		    	<td align = "right">${(Cesium.Cartesian3.magnitude(sta.vel)/1000).toFixed(1)}
		    	<sup>km</sup>&frasl;<sub>s</sub></td></tr>
		    	<tr><td>Orbital period</td>
		    	<td align = "right">${(Math.PI/(ele.mmo*30)).toFixed(1)} min</td></tr>`
		}

		if (typeof(same["DragCoeff"]) === "number")
		{
		    htm = htm +	`<tr><td>Drag coefficient</td>
			<td align = "right">${(same["DragCoeff"]).toFixed(4)}</td></tr>
			</table> <p></p>`
		}
		if (typeof(same["BallCoeff"]) === "number")
		{
		    htm = htm +	`<tr><td>Ballistic coefficient</td>
			<td align = "right">${(same["BallCoeff"]*1E4).toFixed(2)}
			<sup>cm&sup2;</sup>&frasl;<sub>kg</sub></td></tr>
			</table> <p></p>`
		}
		if (typeof(same["AreaToMass"]) === "number")
		{
		    htm = htm +	`<tr><td>Area to mass ratio</td>
			<td align = "right">${(same["AreaToMass"]).toFixed(4)}
			<sup>m&sup2;</sup>&frasl;<sub>kg</sub></td></tr>
			</table> <p></p>`
		}

		obj.description = obj.description + htm
		if (same["DataSource"] == "UCS")
		    break
	    }
	    else
	    {
		sta = eltocart(u, true, 1E-6, 100)
		Cesium.Matrix3.multiplyByVector(CRFtoTRF, sta, Y)
	    }

	    CsView.scene.mapProjection.ellipsoid.cartesianToCartographic(Y, car)
	    if (Number.isNaN(car.longitude) || Number.isNaN(car.latitude) || Number.isNaN(car.height))
		continue
	    arr.push(car.longitude, car.latitude, car.height)
	}

	if (same["DataSource"] == "UCS")
	{
	    i++
	    continue
	}

	var ent = CsView.entities.getById(s)
	ent.polyline = {
	    positions : Cesium.Cartesian3.fromRadiansArrayHeights(arr),
	    width : 1,
	    material : ent.point.color.getValue()
	}
	ent.label = {text : `(${i})`,
		     font : "bold 14pt monospace",
		     style: Cesium.LabelStyle.FILL_AND_OUTLINE,
		     outlineWidth : 2,
		     fillColor : Cesium.Color.YELLOW,
		     horizontalOrigin : Cesium.HorizontalOrigin.LEFT,
		     pixelOffset : new Cesium.Cartesian2(0, 9),
		     showBackground : true
		    }
	CsOrbitEnt.push(ent)
	i++
    }
}

function OnTrackClick()
{
    if (Cesium.defined(CsView.selectedEntity))
    {
	CsView.zoomTo(CsView.selectedEntity,
		      new Cesium.HeadingPitchRange(0, -Math.PI/2, 1E7)).
	    then(function () {
		DisplayOrbit(CsView.selectedEntity)
	    })
    }
}

$("#SearchBox").on("autocompleteselect", function (event, ui)
{
    event.preventDefault()
    this.value = ui.item.label
    CsView.selectedEntity = CsView.entities.getById(ui.item.value)
})

$("#DataSrcSelect").selectmenu({width : "100%",
    select : function (event, ui)
    {
	DisplayObjects(ObjData)
    }
})

$("#OriginSelect").selectmenu({width : "100%",
    select : function (event, ui)
    {
	DisplayObjects(ObjData)
    }
})

$("#RegimeSelect").selectmenu({width : "100%",
    select : function (event, ui)
    {
	DisplayObjects(ObjData)
    }
})

function OnToggleDebris()
{
    window.document.getElementById("Loader").style.display = "inline"
    var cb = window.document.getElementById("DebrisToggle")
    if (cb.checked && !DebrisLoaded)
    {
	GetSpaceObjects("/AstriaGraph/api/www_query?filter=", "DEB", DisplayObjects)
	DebrisLoaded = true
    }
    else
	DisplayObjects(ObjData)
}

function SetCesiumHome()
{
    Cesium.Camera.DEFAULT_VIEW_RECTANGLE = Cesium.Rectangle.fromDegrees(
	HomeLon, HomeLat, HomeLon + 3, HomeLat - 3)
    Cesium.Camera.DEFAULT_VIEW_FACTOR = 3
}

Cesium.BingMapsApi.defaultKey = 'AvpcYMdwXvBkX6V51Yz9Lgfspl-qOUbaNkXhlMMiJCLuFxok3AeeV4-7d58kqCzY'

var CsView = new Cesium.Viewer("MainDisplay", {
    imageryProvider : Cesium.createTileMapServiceImageryProvider({
	url : Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII")
    }),
    baseLayerPicker : true,
    geocoder : false,
    animation : true,
    timeline : true,
    homeButton : true,
    infoBox : true,
    sceneModePicker : true,
    navigationHelpButton : true,
    skyAtmosphere : false,
    skyBox : false,
    CreditDisplay : true,
    shouldAnimate : true,
    selectionIndicator : false
})

CsView.clock.startTime = SimStart.clone()
CsView.clock.stopTime = SimStop.clone()
CsView.clock.currentTime = SimStart.clone()
CsView.clock.clockRange = Cesium.ClockRange.CLAMPED
CsView.clock.multiplier = 1
CsView.timeline.zoomTo(SimStart, SimStop)

CsView.selectedEntityChanged.addEventListener(OnTrackClick)

CsView.scene.globe.enableLighting = true

// Get Geolocation if possible. On error, default to Austin, TX
if (!(typeof navigator.geolocation === "undefined"))
{
    navigator.geolocation.getCurrentPosition(
	function(pos)
	{
	    HomeLat = pos.coords.latitude
	    HomeLon = pos.coords.longitude
	    SetCesiumHome()
	},
	function(err)
	{
	    HomeLat = 30.3
	    HomeLon = -97.7
	    SetCesiumHome()
	})
}
else
{
    HomeLat = 30.3
    HomeLon = -97.7
    SetCesiumHome()
}

$.get("./origins.csv", function (csv) {
    var recs = csv.split(/\r\n|\n/)
    for (var i = 0; i < recs.length; i++)
    {
	fields = recs[i].split(/,/)
	if (fields.length == 2)
	    $("#OriginSelect").append($("<option>",
					{value : fields[1],
					 text : fields[0]}))
    }

    $("#OriginSelect").val("ALL")
    $("#OriginSelect").selectmenu({width : "100%"})
    $("#OriginSelect").selectmenu("refresh")
})

Cesium.Transforms.preloadIcrfFixed(new Cesium.TimeInterval({
    start: new Cesium.JulianDate(J2000Epoch - JulCent),
    stop: new Cesium.JulianDate(J2000Epoch + JulCent),})).then(function() {
	GetDataSources()
})
