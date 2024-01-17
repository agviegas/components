import * as THREE from "three";
import * as WEBIFC from "web-ifc";
import {Base} from "./base.js";

export class SimpleWalls {

    #thickness;

    #xPosition = 0;
    #yPosition = 0;
    #zPosition = 0;

    get thickness() {
        return this.#thickness;
    }

    set thickness(value) {
        this.#thickness = value;
        this.openingProfile.YDim.value = value;
        this.ifcAPI.WriteLine(this.model, this.openingProfile);
        this.regenerate();
    }

    get xPosition() {
        return this.#xPosition;
    }

    set xPosition(value) {
        this.#xPosition = value;
        this.openingLocation.Coordinates[0].value = value;
        this.ifcAPI.WriteLine(this.model, this.openingLocation);
        this.regenerate();
    }

    get yPosition() {
        return this.#yPosition;
    }

    set yPosition(value) {
        this.#yPosition = value;
        this.openingLocation.Coordinates[1].value = value;
        this.ifcAPI.WriteLine(this.model, this.openingLocation);
        this.regenerate();
    }

    get zPosition() {
        return this.#zPosition;
    }

    set zPosition(value) {
        this.#zPosition = value;
        this.openingLocation.Coordinates[2].value = value;
        this.ifcAPI.WriteLine(this.model, this.openingLocation);
        this.regenerate();
    }


    constructor(ifcAPI, model) {
        this.geometryNeedsUpdate = true;

        this.#thickness = 0.25;
        this.ids = [];

        this.ifcAPI = ifcAPI;
        this.model = model;
        this.base = new Base(ifcAPI, model);

        const material = new THREE.MeshLambertMaterial();
        const geometry = new THREE.BufferGeometry();
        this.mesh = new THREE.InstancedMesh(geometry, material, 10);
        this.mesh.count = 0;

        let direction = this.base.direction([0, 0, 1]);

        let axis = this.base.axis2Placement2D([0, 0]);
        const x = this.base.positiveLength(1);
        const y = this.base.positiveLength(0.25);
        this.profile = this.base.rectangularProfile(axis, x, y);
        let {placement} = this.base.axis2Placement3D([0, 0, 0]);
        this.solid = this.base.extrudedAreaSolid(this.profile, placement, direction, 2);

        const openingAxis = this.base.axis2Placement2D([0, 0]);
        const openingX = this.base.positiveLength(1);
        const openingY = this.base.positiveLength(0.25);
        this.openingProfile = this.base.rectangularProfile(openingAxis, openingX, openingY);
        const openingPlacement = this.base.axis2Placement3D([0.1, 0.1, 0.1]);
        this.openingSolid = this.base.extrudedAreaSolid(this.openingProfile, openingPlacement.placement, direction, 2);

        this.openingLocation = openingPlacement.point;
    }

    add(coords) {
        const {model, ifcAPI, solid, openingSolid} = this;

        let {placement} = this.base.axis2Placement3D(coords);

        this.bool = this.base.bool(solid, openingSolid);

        let wall = this.base.simpleWall("GUID", placement, this.bool);

        ifcAPI.WriteLine(model, wall);

        // const [x, y, z] = coords;
        // const openingPlacement = this.base.axis2Placement3D([x + 0.1, y + 0.1, z + 0.1]);
        // const opening = this.base.opening("GUID", openingPlacement, openingSolid);
        // ifcAPI.WriteLine(model, opening);

        // const voids = this.base.relVoids("GUID", wall, opening);
        // ifcAPI.WriteLine(model, voids);


        this.ids.push(wall.expressID);

        // ifcAPI.applyBool(model, wall);
        // element -> geometry, geometry, geometry

        this.ifcAPI.StreamMeshes(this.model, [wall.expressID], (mesh) => {
            console.log(mesh.geometries.size())
            const geometry = mesh.geometries.get(0);
            const matrix = new THREE.Matrix4().fromArray(geometry.flatTransformation);
            this.mesh.setMatrixAt(this.mesh.count++, matrix);
        });

        this.mesh.instanceMatrix.needsUpdate = true;

        if (this.geometryNeedsUpdate) {
            this.regenerate();
            this.geometryNeedsUpdate = false;
        }
    }

    regenerate() {
        this.ifcAPI.StreamMeshes(this.model, [this.ids[0]], (mesh) => {
            this.mesh.geometry.dispose();
            const geometryID = mesh.geometries.get(0).geometryExpressID;
            const data = this.ifcAPI.GetGeometry(this.model, geometryID);
            this.mesh.geometry = this.base.geometry(data)
        });
    }

}