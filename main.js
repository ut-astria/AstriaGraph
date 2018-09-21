/*
 * Author : Shiva Iyer (shiva.iyer AT utexas DOT edu)
 *
 * Entry point and helper routines for AstriaGraph.
 */

var ClientConf

var ObjData = {}
var DebrisLoaded = false

var CsOrbitEnt = []

var HomeLat = 30.3
var HomeLon = -97.7

var SimInt = 90*60
var SimStart = Cesium.JulianDate.now()
var SimStop = Cesium.JulianDate.addSeconds(SimStart, SimInt, new Cesium.JulianDate())

function DownloadData(url, filt, OnDone)
{
    $.ajax({method : "GET",
    url : url + filt,
    success : function(resp)
    {
	var s,p,o
	var recs = resp.split(/\r\n|\n/)

	for (var i = 1; i < recs.length; i++)
	{
	    fields = recs[i].split(/,/)
	    if (fields.length < 3)
		continue

	    s = fields[0]
	    p = fields[1]
	    o = Number(fields[2])
	    if (isNaN(o))
		o = fields[2]

	    if (!ObjData.hasOwnProperty(s))
		ObjData[s] = {}

	    ObjData[s][p] = o
	}

	OnDone(ObjData)
    }})
}

function DisplayObjects(D)
{
    var epjd = new Cesium.JulianDate()
    var pos = new Cesium.Cartesian3()
    var vel = new Cesium.Cartesian3()
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
	if (trk["originator"] == "UCS")
	    active.push(trk["id"])

	if (trk["originator"] == "USSTRATCOM" &&
	    trk["comment"].slice(0, 4) == "2018" &&
	    trk["name"].search("DEB") == -1 &&
	    trk["name"].search("R/B") == -1)
	    active.push(trk["id"])
    }

    for (s in D)
    {
	trk = D[s]
	if (trk["originator"] == "UCS")
	    continue

	ent = CsView.entities.getById(s)
	if ((dsnsel == "ALL" || dsnsel == trk["originator"]) &&
	    (orgsel == "ALL" || orgsel == trk["origin"]) &&
	    (regsel == "A" || regsel == trk["class"]))
	{
	    name = trk["name"] + " (" + trk["id"] + ")"
	    for (i = 0; i < names.length; i++)
	    {
		if (names[i].label == name)
		    break
	    }

	    if (i == names.length)
		names.push({label : name, value : s})

	    if (!(typeof ent === "undefined"))
	    {
		ent.show = (trk["name"].search("R/B") == -1 &&
		trk["name"].search("DEB") == -1) || debcb.checked
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

	fld = trk["comment"].split(/\t/)
	if (fld.length == 3)
	{
	    trk["comment"] = fld[0]
	    trk["origin"] = fld[1]
	    trk["class"] = fld[2]
	}

	pos.x = trk["x"]
	pos.y = trk["y"]
	pos.z = trk["z"]
	vel.x = trk["xdot"]
	vel.y = trk["ydot"]
	vel.z = trk["zdot"]

	Cesium.JulianDate.fromIso8601(trk["epoch"], epjd)
	t = Cesium.JulianDate.daysDifference(SimStart, epjd)

	ele = carttoel(WGS72_mu, pos, vel)
	ele.mmo = Math.sqrt(WGS72_mu/(ele.sma*ele.sma*ele.sma))
	ele.mean = (ele.mean + ele.mmo*t*86400) % TwoPi
	trk["elem"] = ele

	if (active.indexOf(trk["id"]) == -1)
	    col = Cesium.Color.CYAN
	else
	    col = Cesium.Color.DARKORANGE
	if (trk["name"].search("R/B") != -1)
	    col = Cesium.Color.MEDIUMORCHID
	if (trk["name"].search("DEB") != -1)
	    col = Cesium.Color.GRAY
	if ((trk["id"][0] == "V" && trk["originator"] == "JSC Vimpel") ||
	    trk["originator"] == "SeeSat-L")
	    col = Cesium.Color.DEEPPINK

	CsView.entities.add({id : s,
			     name : trk["name"],
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
	var ele = ObjData[trkid]["elem"]
	var t = Cesium.JulianDate.secondsDifference(CsView.clock.currentTime, SimStart)

	var u = jQuery.extend({}, ele)
	u.mean = (u.mean + u.mmo*t) % TwoPi

	var eff = new Cesium.Cartesian3()
	var eci = eltocart(WGS72_mu, u, true, 1E-3)

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
    var ent, trk = ObjData[obj.id]
    for (var s in ObjData)
    {
	if (ObjData[s]["id"] != trk["id"])
	    continue
	if (dsnsel != "ALL" && dsnsel != ObjData[s]["originator"])
	    continue

	var sta,arr = []
	var ele = ObjData[s]["elem"]
	var u = jQuery.extend({}, ele)

	for (u.mean = 0; u.mean <= 6.29; u.mean += 0.01)
	{
	    if (u.mean == 0)
	    {
		sta = eltocart(WGS72_mu, u, false, 1E-6, 100)
		Cesium.Matrix3.multiplyByVector(CRFtoTRF, sta.pos, Y)

		var htm = `<table border : 1px solid white style = "width:100%">
		    <tr><th align = "center" style = "color:yellow">
		    <strong>Data Source</strong></th>
		    <th align = "center" style = "color:yellow">
		    <strong>(${i}) ${ObjData[s]["originator"]}</strong></th></tr>
		    <tr><td>Name</td>
		    <td align = "right">${ObjData[s]["name"]}</td></tr>
		    <tr><td>Country</td>
		    <td align = "right">${ObjData[s]["origin"]}</td></tr>`

		if (ObjData[s]["originator"] == "USSTRATCOM" ||
		    ObjData[s]["originator"] == "SeeSat-L")
		{
		    htm = htm +
			`<tr><td>Object ID</td>
			<td align = "right">${ObjData[s]["id"]}</td></tr>
			<tr><td>Launch date</td>
			<td align = "right">${ObjData[s]["comment"]}</td></tr>`
		}

		if (ObjData[s]["originator"] == "UCS")
		{
		    htm = htm +
			`<tr><td>Operator</td>
			<td align = "right">${ObjData[s]["operator"]}</td></tr>
			<tr><td>Users</td>
			<td align = "right">${ObjData[s]["users"]}</td></tr>
			<tr><td>Purpose</td>
			<td align = "right">${ObjData[s]["purpose"]}</td></tr>
			<tr><td>Detailed purpose</td>
			<td align = "right">${ObjData[s]["detailed_purpose"]}</td></tr>
		    	<tr><td>Launch mass [kg]</td>
		    	<td align = "right">${ObjData[s]["launch_mass"]}</td></tr>
		    	<tr><td>Dry mass [kg]</td>
		    	<td align = "right">${ObjData[s]["dry_mass"]}</td></tr>
		    	<tr><td>Power [W]</td>
		    	<td align = "right">${ObjData[s]["power"]}</td></tr>
		    	<tr><td>Lifetime [years]</td>
		    	<td align = "right">${ObjData[s]["lifetime"]}</td></tr>
			<tr><td>Contractor</td>
			<td align = "right">${ObjData[s]["contractor"]}</td></tr>
			<tr><td>Launch site</td>
			<td align = "right">${ObjData[s]["launch_site"]}</td></tr>
			<tr><td>Launch vehicle</td>
			<td align = "right">${ObjData[s]["launch_vehicle"]}</td></tr>
			<tr><td>Launch date</td>
			<td align = "right">${ObjData[s]["launch_date"]}</td></tr>`
		}
		else
		{
			htm = htm +
			`<tr><td>Data epoch</td>
		    	<td align = "right">${ObjData[s]["epoch"].substring(0, 24)}</td></tr>
		    	<tr><td>Semi-major axis</td>
		    	<td align = "right">${(ele.sma/1000).toFixed(1)} km</td></tr>
		    	<tr><td>Eccentricity</td>
		    	<td align = "right">${ele.ecc.toFixed(4)}</td></tr>
		    	<tr><td>Inclination</td>
		    	<td align = "right">${(ele.inc*180/Math.PI).toFixed(4)}&deg;</td></tr>
		    	<tr><td>RA of ascending node</td>
		    	<td align = "right">${(ele.raan*180/Math.PI).toFixed(4)}&deg;</td></tr>
		    	<tr><td>Argument of perigee</td>
		    	<td align = "right">${(ele.argp*180/Math.PI).toFixed(4)}&deg;</td></tr>
		    	<tr><td>Mean motion</td>
		    	<td align = "right">${(ele.mmo*180/Math.PI).toFixed(4)}
		    	<sup>&deg;</sup>&frasl;<sub>s</sub></td></tr>
		    	<tr><td>Orbital speed</td>
		    	<td align = "right">${(Cesium.Cartesian3.magnitude(sta.vel)/1000).toFixed(1)}
		    	<sup>km</sup>&frasl;<sub>s</sub></td></tr>
		    	<tr><td>Orbital period</td>
		    	<td align = "right">${(Math.PI/(ele.mmo*30)).toFixed(1)} min</td></tr>`
		}

		if (ObjData[s]["originator"] == "LeoLabs" ||
		    ObjData[s]["originator"] == "Astria OD/LeoLabs data" ||
		    ObjData[s]["originator"] == "Astria OD/Starbrook data")
		{
		    htm = htm +
			`<tr><td>Drag coefficient</td>
			<td align = "right">${(ObjData[s]["dragcoeff"]).toFixed(4)}</td></tr>
			</table> <p></p>`
		}
		else if (ObjData[s]["originator"] == "JSC Vimpel")
		{
		    htm = htm +
			`<tr><td>Area to mass ratio</td>
			<td align = "right">${(ObjData[s]["dragcoeff"]).toFixed(4)}
			<sup>m&sup2;</sup>&frasl;<sub>kg</sub></td></tr>
			</table> <p></p>`
		}
		else if (ObjData[s]["originator"] != "UCS" &&
			 ObjData[s]["originator"] != "SeeSat-L")
		{
		    htm = htm +
			`<tr><td>Ballistic coefficient</td>
			<td align = "right">${(ObjData[s]["dragcoeff"]*1E4).toFixed(2)}
			<sup>cm&sup2;</sup>&frasl;<sub>kg</sub></td></tr>
			</table> <p></p>`
		}

		obj.description = obj.description + htm
	    }
	    else
	    {
		sta = eltocart(WGS72_mu, u, true, 1E-6, 100)
		Cesium.Matrix3.multiplyByVector(CRFtoTRF, sta, Y)
	    }

	    CsView.scene.mapProjection.ellipsoid.cartesianToCartographic(Y, car)
	    if (Number.isNaN(car.longitude) || Number.isNaN(car.latitude) ||
		Number.isNaN(car.height))
		continue
	    arr.push(car.longitude, car.latitude, car.height)
	}

	ent = CsView.entities.getById(s)
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
	DownloadData(ClientConf.Query.ReadEndPoint, "DEB", DisplayObjects)
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

    $.get("./cliconf.json", function (json) {
	ClientConf = JSON.parse(json)

	DownloadData(ClientConf.Query.ReadEndPoint, "NODEB", DisplayObjects)
    }, "text")
})
