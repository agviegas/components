import * as THREE from "three";
import * as WEBIFC from "web-ifc";
import {Base} from "./base.js";

export class CircularColumns {

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
        const radius = this.base.positiveLength(0.25);
        this.profile = this.base.circularProfile(axis, radius);

        let placement = this.base.axis2Placement3D([0, 0, 0]);

        this.solid = this.base.extrudedAreaSolid(this.profile, placement, direction, 2);
    }

    add(coords) {
        const {model, ifcAPI, solid} = this;

        let placement = this.base.axis2Placement3D(coords);
        let column = this.base.column("GUID", placement, solid);

        ifcAPI.WriteLine(model, column);

        this.ids.push(column.expressID);

        this.ifcAPI.StreamMeshes(this.model, [column.expressID], (mesh) => {
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