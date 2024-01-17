import * as THREE from "three";
import * as WEBIFC from "web-ifc";
import {Base} from "./base.js";

export class SimpleWalls {

    #thickness;

    get thickness() {
        return this.#thickness;
    }

    set thickness(value) {
        this.#thickness = value;
        this.profile.Radius.value = value;
        this.ifcAPI.WriteLine(this.model, this.profile);
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
        let placement = this.base.axis2Placement3D([0, 0, 0]);
        this.solid = this.base.extrudedAreaSolid(this.profile, placement, direction, 2);

        let openingDirection = this.base.direction([0, 0, 1]);
        let openingAxis = this.base.axis2Placement2D([0, 0]);
        const openingX = this.base.positiveLength(1);
        const openingY = this.base.positiveLength(0.25);
        const openingProfile = this.base.rectangularProfile(openingAxis, openingX, openingY);
        let openingPlacement = this.base.axis2Placement3D([0, 0, 0]);
        this.openingSolid = this.base.extrudedAreaSolid(openingProfile, openingPlacement, openingDirection, 2);
    }

    add(coords) {
        const {model, ifcAPI, solid, openingSolid} = this;

        let placement = this.base.axis2Placement3D(coords);
        let wall = this.base.simpleWall("GUID", placement, solid);
        ifcAPI.WriteLine(model, wall);

        const [x, y, z] = coords;
        const openingPlacement = this.base.axis2Placement3D([x + 0.1, y + 0.1, z + 0.1]);
        const opening = this.base.opening("GUID", openingPlacement, openingSolid);
        ifcAPI.WriteLine(model, opening);

        const voids = this.base.relVoids("GUID", wall, opening);
        ifcAPI.WriteLine(model, voids);


        this.ids.push(wall.expressID);

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
        this.ifcAPI.StreamMeshes(this.model, [this.ids[0]], () => {
            this.mesh.geometry.dispose();
            const data = this.ifcAPI.GetGeometry(this.model, this.solid.expressID);
            this.mesh.geometry = this.base.geometry(data)
        });
    }

}