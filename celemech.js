/*
 * Author : Shiva Iyer (shiva.iyer AT utexas DOT edu)
 *
 * Routines for various tasks in celestial mechanics.
 */

var J2000Epoch = 2451545.0
var JulYear = 365.25
var JulCent = JulYear*100

// WGS-72 constants used for TLEs
var WGS72_mu = 3.986008E14      // m^3/s^2
var WGS72_REarth = 6.378135E6  // m

var TwoPi = (2*Math.PI)
var RadDeg = (180/Math.PI)
var DegRad = (Math.PI/180)

function ecceanom(mean, ecc, tol, MAXITER)
{
    var curr
    var prev = mean

    for (i = 1; i <= MAXITER; i++)
    {
        curr = prev-(prev-ecc*Math.sin(prev)-mean)/(1-ecc*Math.cos(prev))
        if (Math.abs(curr - prev) <= tol)
            return(curr % TwoPi)

        prev = curr
    }

    ecan = NaN
}

function carttoel(mu, pos, vel)
{
    var r = Cesium.Cartesian3.magnitude(pos)
    var v = Cesium.Cartesian3.magnitude(vel)

    var H = new Cesium.Cartesian3
    Cesium.Cartesian3.cross(pos, vel, H)
    var h = Cesium.Cartesian3.magnitude(H)

    var N = new Cesium.Cartesian3
    Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z, H, N)
    var n = Cesium.Cartesian3.magnitude(N)

    var E = new Cesium.Cartesian3
    var E1 = new Cesium.Cartesian3
    var E2 = new Cesium.Cartesian3
    Cesium.Cartesian3.subtract(Cesium.Cartesian3.divideByScalar(
	Cesium.Cartesian3.cross(vel, H, E1), mu, E1),
	Cesium.Cartesian3.divideByScalar(pos, r, E2), E)

    var sma = 1/(2/r - v*v/mu)
    var ecc = Cesium.Cartesian3.magnitude(E)
    var inc = Math.acos(Cesium.Cartesian3.dot(H, Cesium.Cartesian3.UNIT_Z)/h)

    var raan = Math.acos(Cesium.Cartesian3.dot(N, Cesium.Cartesian3.UNIT_X)/n)
    if (Cesium.Cartesian3.dot(Cesium.Cartesian3.UNIT_Y, N) < 0)
        raan = TwoPi - raan

    var argp = Math.acos(Cesium.Cartesian3.dot(N, E)/(n*ecc))
    if (Cesium.Cartesian3.dot(Cesium.Cartesian3.UNIT_Z, E) < 0)
        argp = TwoPi - argp

    var tran = Math.acos(Cesium.Cartesian3.dot(pos, E)/(r*ecc))
    if (Cesium.Cartesian3.dot(pos, vel) < 0)
        tran = TwoPi - tran

    if (ecc > 1)
    {
        var ehan = Math.asinh(Math.sin(tran)*
			      Math.sqrt(ecc*ecc-1)/(1+ecc*Math.cos(tran)))
        var mean = (ecc*Math.sinh(ehan)-ehan) % TwoPi
    }
    else
    {
        var ehan = 2*Math.atan2(Math.sqrt((1-ecc)/(1+ecc))*
				Math.sin(tran/2), Math.cos(tran/2))
        var mean = (ehan-ecc*Math.sin(ehan)) % TwoPi
    }

    return({sma : sma, ecc : ecc, inc : inc, raan : raan,
	    argp : argp, mean : mean})
}

function eltocart(mu, ele, posonly = false, tol = 1E-6, MAXITER = 20)
{
    var ecan = ecceanom(ele.mean, ele.ecc, tol, MAXITER)
    var tran = 2*Math.atan2(Math.sqrt((1+ele.ecc)/(1-ele.ecc))*
			    Math.sin(ecan/2), Math.cos(ecan/2))

    var p = ele.sma*(1 - ele.ecc*ele.ecc)
    var r = p/(1 + ele.ecc*Math.cos(tran))
    var h = Math.sqrt(mu*p)

    var ci = Math.cos(ele.inc)
    var si = Math.sin(ele.inc)
    var cr = Math.cos(ele.raan)
    var sr = Math.sin(ele.raan)
    var cw = Math.cos(ele.argp + tran)
    var sw = Math.sin(ele.argp + tran)

    var pos = new Cesium.Cartesian3(cr*cw-sr*sw*ci, sr*cw+cr*sw*ci, si*sw)
    var pos2 = new Cesium.Cartesian3()
    Cesium.Cartesian3.multiplyByScalar(pos, r, pos2)
    if (posonly)
	return(pos2)

    var vel = new Cesium.Cartesian3()
    var vel1 = new Cesium.Cartesian3()
    var vel2 = new Cesium.Cartesian3()
    Cesium.Cartesian3.subtract(
	Cesium.Cartesian3.multiplyByScalar(
	    pos2, h*ele.ecc*Math.sin(tran)/(r*p), vel1),
	Cesium.Cartesian3.multiplyByScalar(
	    new Cesium.Cartesian3(cr*sw+sr*cw*ci,
				  sr*sw-cr*cw*ci,-si*cw),h/r,vel2),vel)

    return({pos : pos2, vel : vel})
}
