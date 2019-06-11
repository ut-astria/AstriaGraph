/*
 * celemech.js - Celestial mechanics conversion routines.
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

var J2000Epoch = 2451545.0
var JulYear = 365.25
var JulCent = JulYear*100

var EGM96_mu = 3.986004415E14  // m^3/s^2
var EGM96_REarth = 6378136.3   // m

var TwoPi = (2*Math.PI)
var RadDeg = (180/Math.PI)
var DegRad = (Math.PI/180)

function ecceanom(mean, ecc, tol, MAXITER)
{
    var prev = mean
    for (i = 1; i <= MAXITER; i++)
    {
        var curr = prev-(prev-ecc*Math.sin(prev)-mean)/(1-ecc*Math.cos(prev))
        if (Math.abs(curr - prev) <= tol)
            return(curr % TwoPi)
        prev = curr
    }

    return(NaN)
}

function eltocart(ele, posonly = false, tol = 1E-6, MAXITER = 20)
{
    var ecan = ecceanom(ele.MeanAnom, ele.Ecc, tol, MAXITER)
    var tran = 2*Math.atan2(Math.sqrt((1+ele.Ecc)/(1-ele.Ecc))*
			    Math.sin(ecan/2), Math.cos(ecan/2))

    var p = ele.SMA*(1 - ele.Ecc*ele.Ecc)
    var r = p/(1 + ele.Ecc*Math.cos(tran))
    var h = Math.sqrt(EGM96_mu*p)

    var ci = Math.cos(ele.Inc)
    var si = Math.sin(ele.Inc)
    var cr = Math.cos(ele.RAAN)
    var sr = Math.sin(ele.RAAN)
    var cw = Math.cos(ele.ArgP + tran)
    var sw = Math.sin(ele.ArgP + tran)

    var pos = new Cesium.Cartesian3(cr*cw-sr*sw*ci, sr*cw+cr*sw*ci, si*sw)
    var pos2 = new Cesium.Cartesian3()
    Cesium.Cartesian3.multiplyByScalar(pos, r, pos2)
    if (posonly)
	return(pos2)

    var vel = new Cesium.Cartesian3()
    var vel1 = new Cesium.Cartesian3()
    var vel2 = new Cesium.Cartesian3()
    Cesium.Cartesian3.subtract(Cesium.Cartesian3.multiplyByScalar(
	pos2, h*ele.Ecc*Math.sin(tran)/(r*p), vel1), Cesium.Cartesian3.multiplyByScalar(
	    new Cesium.Cartesian3(cr*sw+sr*cw*ci, sr*sw-cr*cw*ci,-si*cw),h/r,vel2),vel)

    return({pos : pos2, vel : vel})
}
